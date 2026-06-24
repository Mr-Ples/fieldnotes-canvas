import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, MessageCircleReply, Paperclip, RefreshCw, Send, SmilePlus, Unplug } from 'lucide-react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { getDeviceId, getGuestName, setGuestName as saveGuestName } from '../services/api'
import DiscordConnectModal from './DiscordConnectModal'
import DiscordIdentity, { type DiscordUser } from './DiscordIdentity'
import { CloudinaryMediaStorage, type StoredMedia } from '../services/media'

type Message = {
  id: string; origin: 'website' | 'discord'; authorId: string; authorName: string; authorAvatar?: string;
  content: string; replyTo?: string; attachments: Array<{ id: string; name: string; url: string; contentType?: string }>;
  reactions: Array<{ emoji: string; count: number; participants: string[] }>;
  discordMessageId?: string; discordChannelId?: string; discordGuildId?: string; createdAt: number; editedAt?: number;
  deleted: boolean; syncStatus: 'local' | 'pending' | 'synced' | 'unlinked' | 'failed'
}

const REACTION_EMOJIS = ['👍', '👎', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '✅', '👀', '🙏', '💯', '🤔', '👏', '🚀']

export default function CanvasChat() {
  const [canvas, setCanvas] = useState(() => activeCanvas())
  const [messages, setMessages] = useState<Message[]>([])
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState<Message>()
  const [connected, setConnected] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploads, setUploads] = useState<StoredMedia[]>([])
  const [uploading, setUploading] = useState(false)
  const [typers, setTypers] = useState(() => new Map<string, { name: string; expires: number }>())
  const [reactionPicker, setReactionPicker] = useState('')
  const [guestName, setGuestName] = useState(getGuestName)
  const [myReactions, setMyReactions] = useState(() => new Set<string>())
  const [error, setError] = useState('')
  const [discordLinked, setDiscordLinked] = useState(false)
  const [discordInvite, setDiscordInvite] = useState('')
  const [discordAuthorization, setDiscordAuthorization] = useState('')
  const [identity, setIdentity] = useState<DiscordUser | null>(null)
  const [connectOpen, setConnectOpen] = useState(() => new URL(window.location.href).searchParams.has('discordConnect'))
  const list = useRef<VirtuosoHandle>(null)
  const socketRef = useRef<WebSocket | undefined>(undefined)
  const typingSentAt = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const storage = useRef(new CloudinaryMediaStorage())
  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages])

  useEffect(() => {
    const select = (event: Event) => setCanvas((event as CustomEvent<{ id: string; title: string }>).detail)
    window.addEventListener('fieldnotes:canvas-selected', select)
    return () => window.removeEventListener('fieldnotes:canvas-selected', select)
  }, [])

  useEffect(() => {
    let disposed = false
    let socket: WebSocket | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    setMessages([]); setError('')

    const merge = (incoming: Message[]) => setMessages((current) => {
      const indexed = new Map(current.map((message) => [message.id, message]))
      incoming.forEach((message) => indexed.set(message.id, message))
      return [...indexed.values()].sort((a, b) => a.createdAt - b.createdAt)
    })
    const connect = () => {
      const url = new URL(`/api/canvases/${encodeURIComponent(canvas.id)}/chat`, window.location.origin)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(url)
      socketRef.current = socket
      socket.onopen = () => { attempts = 0; setConnected(true) }
      socket.onmessage = (event) => {
        if (event.data === 'pong') return
        const payload = JSON.parse(event.data) as { type: string; message?: Message; messages?: Message[]; userId?: string; authorName?: string }
        if (payload.messages) merge(payload.messages)
        if (payload.message) merge([payload.message])
        if (payload.type === 'typing' && payload.authorName && payload.userId) {
          setTypers((current) => new Map(current).set(payload.userId!, { name: payload.authorName!, expires: Date.now() + 5_000 }))
        }
      }
      socket.onclose = () => {
        setConnected(false)
        if (!disposed) retry = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** attempts++))
      }
      socket.onerror = () => socket?.close()
    }
    void fetch(`/api/canvases/${encodeURIComponent(canvas.id)}/messages`).then(async (response) => {
      if (!response.ok) throw new Error('Could not load chat')
      const result = await response.json() as { messages: Message[]; discord?: { channelId: string; inviteUrl?: string } | null }
      if (!disposed) { merge(result.messages); setDiscordLinked(Boolean(result.discord)); setDiscordInvite(result.discord?.inviteUrl ?? '') }
      if (result.discord && !result.discord.inviteUrl) {
        const inviteResponse = await fetch('/api/canvases/' + encodeURIComponent(canvas.id) + '/discord-invite', { method: 'POST' })
        const invite = await inviteResponse.json() as { inviteUrl?: string; authorizationUrl?: string }
        if (!disposed && inviteResponse.ok) setDiscordInvite(invite.inviteUrl ?? '')
        else if (!disposed) setDiscordAuthorization(invite.authorizationUrl ?? '')
      }
    }).catch((reason) => { if (!disposed) setError(reason instanceof Error ? reason.message : 'Could not load chat') })
    connect()
    return () => { disposed = true; clearTimeout(retry); socket?.close(); socketRef.current = undefined }
  }, [canvas.id])

  useEffect(() => {
    const timer = setInterval(() => setTypers((current) => {
      const next = new Map([...current].filter(([, typer]) => typer.expires > Date.now()))
      return next.size === current.size ? current : next
    }), 1_000)
    return () => clearInterval(timer)
  }, [])

  const send = async () => {
    const value = content.trim()
    if ((!value && !uploads.length) || sending) return
    setSending(true); setError('')
    try {
      const response = await fetch(`/api/canvases/${encodeURIComponent(canvas.id)}/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-fieldnotes-device': getDeviceId() },
        body: JSON.stringify({ content: value, replyTo: replyTo?.id, guestName, attachments: uploads.map((file) => ({ id: file.id, name: file.name, url: file.url })) }),
      })
      const result = await response.json() as { message?: Message; error?: string }
      if (!response.ok || !result.message) throw new Error(result.error ?? 'Could not send message')
      setMessages((current) => current.some((item) => item.id === result.message!.id) ? current : [...current, result.message!])
      setContent(''); setReplyTo(undefined); setUploads([])
      requestAnimationFrame(() => list.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' }))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send message') }
    finally { setSending(false) }
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || uploading) return
    setUploading(true); setError('')
    try {
      if ([...files].some((file) => file.size > 10_000_000)) throw new Error('Discord attachments must be 10 MB or smaller')
      const next: StoredMedia[] = []
      for (const file of [...files].slice(0, Math.max(0, 10 - uploads.length))) next.push(await storage.current.upload(file))
      setUploads((current) => [...current, ...next].slice(0, 10))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Upload failed') }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = '' }
  }

  const announceTyping = () => {
    const now = Date.now()
    if (now - typingSentAt.current < 7_000 || socketRef.current?.readyState !== WebSocket.OPEN) return
    typingSentAt.current = now
    socketRef.current.send(JSON.stringify({ type: 'typing', guestName }))
  }

  const react = async (message: Message, emoji: string) => {
    const key = message.id + ':' + emoji
    const active = !myReactions.has(key)
    setMyReactions((current) => { const next = new Set(current); active ? next.add(key) : next.delete(key); return next })
    const response = await fetch('/api/canvases/' + encodeURIComponent(canvas.id) + '/messages/' + message.id + '/reactions', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-fieldnotes-device': getDeviceId() },
      body: JSON.stringify({ emoji, guestName }),
    })
    const result = await response.json() as { message?: Message; active?: boolean; error?: string }
    if (!response.ok || !result.message) { setError(result.error ?? 'Could not update reaction'); return }
    setMyReactions((current) => { const next = new Set(current); result.active ? next.add(key) : next.delete(key); return next })
    setMessages((current) => current.map((item) => item.id === result.message!.id ? result.message! : item))
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="border-b border-rule px-3 py-2.5">
      <div className="flex items-center justify-between"><span className="truncate text-[11px] font-semibold">{canvas.title}</span><span className={`flex items-center gap-1 text-[9px] ${connected ? 'text-emerald-700' : 'text-stone-400'}`}>{connected ? <Check size={11}/> : <RefreshCw size={11}/>} {connected ? 'Live' : 'Connecting'}</span></div>
      <button className={`mt-2 w-full rounded-md border px-2 py-1.5 text-[9px] font-semibold ${discordLinked ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`} onClick={() => setConnectOpen(true)}>{discordLinked ? 'Discord connected · Change channel' : 'Connect Discord'}</button>
      <button className="mt-1 flex items-center gap-1 border-0 bg-transparent p-0 text-[9px] text-stone-400" onClick={() => void navigator.clipboard.writeText(canvas.id)} title="Copy canvas ID"><Copy size={10}/> Canvas ID: {canvas.id}</button>
      {discordInvite && <a className="mt-1 inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-700" href={discordInvite} target="_blank" rel="noreferrer">Join Discord server <ExternalLink size={9}/></a>}
      {!discordInvite && discordAuthorization && <a className="mt-1 inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-700" href={discordAuthorization} target="_blank" rel="noreferrer">Enable server invite <ExternalLink size={9}/></a>}
    </div>
    <Virtuoso ref={list} className="min-h-0 flex-1" data={messages} followOutput="smooth" itemContent={(_, message) => {
      const parent = message.replyTo ? byId.get(message.replyTo) : undefined
      return <article id={`discord-message-${message.id}`} className="group px-3 py-2 hover:bg-stone-100/70">
        <div className="flex gap-2">
          {message.authorAvatar ? <img src={message.authorAvatar} alt="" className="size-7 rounded-full"/> : <span className="avatar avatar-sage">{message.authorName.slice(0, 2).toUpperCase()}</span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5"><strong className="truncate text-[10px]">{message.authorName}</strong>{message.origin === 'discord' && <span className="rounded bg-indigo-100 px-1 text-[7px] font-bold text-indigo-700">DISCORD</span>}<time className="text-[8px] text-stone-400">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
            {parent && <div className="mt-1 truncate border-l-2 border-stone-300 pl-2 text-[9px] text-stone-400">{parent.authorName}: {parent.content}</div>}
            <p className={`my-1 whitespace-pre-wrap font-serif text-xs leading-relaxed ${message.deleted ? 'italic text-stone-400' : 'text-stone-700'}`}>{message.deleted ? 'Message deleted' : message.content}</p>
            {message.attachments.map(renderAttachment)}
            <div className="my-1 flex flex-wrap gap-1">{(message.reactions ?? []).map((reaction) => <button key={reaction.emoji} title={(reaction.participants ?? []).join(', ')} aria-label={reaction.emoji + ' from ' + (reaction.participants ?? []).join(', ')} className={'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] ' + (myReactions.has(message.id + ':' + reaction.emoji) ? 'border-indigo-300 bg-indigo-50' : 'border-stone-200 bg-white')} onClick={() => void react(message, reaction.emoji)}>{renderEmoji(reaction.emoji)} {reaction.count}</button>)}</div>
            {(message.reactions ?? []).length > 0 && <div className="mb-1 truncate text-[8px] text-stone-400">{message.reactions.map((reaction) => reaction.emoji + ' ' + (reaction.participants ?? []).join(', ')).join(' · ')}</div>}
            <div className="relative mb-1"><button className="flex items-center gap-1 border-0 bg-transparent p-0 text-[8px] text-stone-500" onClick={() => setReactionPicker((current) => current === message.id ? '' : message.id)}><SmilePlus size={10}/> React</button>{reactionPicker === message.id && <div className="absolute bottom-full left-0 z-20 grid grid-cols-8 gap-1 rounded-lg border border-stone-200 bg-white p-2 shadow-lg">{REACTION_EMOJIS.map((emoji) => <button className="border-0 bg-transparent p-1 text-sm hover:bg-stone-100" key={emoji} onClick={() => { void react(message, emoji); setReactionPicker('') }}>{emoji}</button>)}</div>}</div>
            <div className="flex items-center gap-2"><button className="flex items-center gap-1 border-0 bg-transparent p-0 text-[8px] text-stone-500" onClick={() => setReplyTo(message)}><MessageCircleReply size={10}/> Reply</button>{message.origin === 'website' && <span className={`text-[8px] ${message.syncStatus === 'failed' ? 'text-red-600' : 'text-stone-400'}`}>{message.syncStatus === 'unlinked' ? 'Site only' : message.syncStatus === 'pending' ? 'Sending to Discord…' : message.syncStatus === 'failed' ? 'Discord delivery failed' : 'Synced'}</span>}</div>
          </div>
        </div>
      </article>
    }}/>
    {replyTo && <div className="flex items-center justify-between border-t border-rule bg-stone-100 px-3 py-1.5 text-[9px] text-stone-500"><span className="truncate">Replying to {replyTo.authorName}: {replyTo.content}</span><button className="border-0 bg-transparent" onClick={() => setReplyTo(undefined)}>×</button></div>}
    {error && <div role="alert" className="flex items-center gap-1 px-3 py-1 text-[9px] text-red-700"><Unplug size={10}/>{error}</div>}
    <div className="min-h-4 px-3 text-[9px] italic text-stone-400">{typingLabel([...typers.values()].map((typer) => typer.name))}</div>
    <div className="flex items-center justify-between border-t border-rule px-3 pt-2">
      {identity ? <span className="text-[9px] text-stone-400">Posting as {identity.displayName}</span> : <label className="flex items-center gap-1 text-[9px] text-stone-400">Posting as <input className="w-28 rounded border border-stone-200 bg-white px-1.5 py-1 text-[9px] text-stone-700" maxLength={32} value={guestName} onChange={(event) => setGuestName(event.target.value)} onBlur={() => setGuestName(saveGuestName(guestName))}/></label>}
      <DiscordIdentity compact onChange={setIdentity}/>
    </div>
    <form className="m-3 mt-2 rounded-lg border border-stone-300 bg-white p-2" onSubmit={(event) => { event.preventDefault(); void send() }}>
      <textarea className="h-14 w-full resize-none border-0 bg-transparent text-[11px] outline-none" maxLength={2000} placeholder="Message this canvas and Discord…" value={content} onChange={(event) => { setContent(event.target.value); announceTyping() }}/>
      {uploads.length > 0 && <div className="mb-1 flex flex-wrap gap-1">{uploads.map((file) => <button type="button" className="rounded bg-stone-100 px-1.5 py-1 text-[8px]" key={file.id} onClick={() => setUploads((current) => current.filter((item) => item.id !== file.id))}>{file.name} ×</button>)}</div>}
      <div className="flex items-center justify-between"><span className="text-[8px] text-stone-400">{content.length}/2000</span><div className="flex items-center gap-1"><input ref={fileInput} type="file" multiple hidden onChange={(event) => void uploadFiles(event.target.files)}/><button type="button" className="grid size-7 place-items-center rounded-md border-0 bg-stone-100 text-stone-600 disabled:opacity-40" disabled={uploading || uploads.length >= 10} onClick={() => fileInput.current?.click()} aria-label="Attach files"><Paperclip size={13}/></button><button className="grid size-7 place-items-center rounded-md border-0 bg-forest text-white disabled:opacity-40" disabled={(!content.trim() && !uploads.length) || sending || uploading} aria-label="Send message"><Send size={13}/></button></div></div>
    </form>
    <DiscordConnectModal canvasId={canvas.id} open={connectOpen} onClose={() => setConnectOpen(false)} onLinked={() => {
      setDiscordLinked(true)
      void fetch('/api/canvases/' + encodeURIComponent(canvas.id) + '/discord-invite', { method: 'POST' }).then(async (response) => {
        const result = await response.json() as { inviteUrl?: string; authorizationUrl?: string }
        if (response.ok) setDiscordInvite(result.inviteUrl ?? '')
        else setDiscordAuthorization(result.authorizationUrl ?? '')
      })
    }}/>
  </div>
}

function activeCanvas() {
  const stored = localStorage.getItem('fieldnotes:active-canvas')
  return stored ? JSON.parse(stored) as { id: string; title: string } : { id: 'attention', title: 'Designing for attention' }
}

function renderEmoji(emoji: string) {
  try { emoji = decodeURIComponent(emoji) } catch { /* Keep malformed identifiers visible. */ }
  const custom = emoji.match(/^[^:]+:(\d+)$/)
  return custom ? <img className="size-3.5" src={'https://cdn.discordapp.com/emojis/' + custom[1] + '.webp?size=32'} alt={emoji.split(':')[0]}/> : emoji
}

function renderAttachment(attachment: Message['attachments'][number]) {
  const image = attachment.contentType?.startsWith('image/')
    || attachment.id.startsWith('image:')
    || hasImageExtension(attachment.url)
  if (image) {
    return <a className="mt-1 block w-fit max-w-full" href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}>
      <img className="max-h-56 max-w-full rounded-lg border border-stone-200 object-contain" src={attachment.url} alt={attachment.name}/>
      <span className="mt-0.5 flex items-center gap-1 text-[8px] text-stone-400">{attachment.name}<ExternalLink size={8}/></span>
    </a>
  }
  return <a className="mr-1 inline-flex items-center gap-1 text-[9px] text-emerald-800 underline" href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}>{attachment.name}<ExternalLink size={9}/></a>
}

function hasImageExtension(value: string) {
  try { return /\.(avif|gif|jpe?g|png|webp)$/i.test(new URL(value).pathname) }
  catch { return false }
}

function typingLabel(names: string[]) {
  const unique = [...new Set(names)]
  if (!unique.length) return ''
  if (unique.length === 1) return unique[0] + ' is typing…'
  if (unique.length === 2) return unique[0] + ' and ' + unique[1] + ' are typing…'
  return unique[0] + ', ' + unique[1] + ' and ' + (unique.length - 2) + ' others are typing…'
}
