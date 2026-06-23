import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, MessageCircleReply, RefreshCw, Send, Unplug } from 'lucide-react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { getDeviceId } from '../services/api'
import DiscordConnectModal from './DiscordConnectModal'

type Message = {
  id: string; origin: 'website' | 'discord'; authorId: string; authorName: string; authorAvatar?: string;
  content: string; replyTo?: string; attachments: Array<{ id: string; name: string; url: string; contentType?: string }>;
  discordMessageId?: string; discordChannelId?: string; discordGuildId?: string; createdAt: number; editedAt?: number;
  deleted: boolean; syncStatus: 'local' | 'pending' | 'synced' | 'unlinked' | 'failed'
}

export default function CanvasChat() {
  const [canvas, setCanvas] = useState(() => activeCanvas())
  const [messages, setMessages] = useState<Message[]>([])
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState<Message>()
  const [connected, setConnected] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [discordLinked, setDiscordLinked] = useState(false)
  const [connectOpen, setConnectOpen] = useState(() => new URL(window.location.href).searchParams.has('discordConnect'))
  const list = useRef<VirtuosoHandle>(null)
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
      socket.onopen = () => { attempts = 0; setConnected(true) }
      socket.onmessage = (event) => {
        if (event.data === 'pong') return
        const payload = JSON.parse(event.data) as { type: string; message?: Message; messages?: Message[] }
        if (payload.messages) merge(payload.messages)
        if (payload.message) merge([payload.message])
      }
      socket.onclose = () => {
        setConnected(false)
        if (!disposed) retry = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** attempts++))
      }
      socket.onerror = () => socket?.close()
    }
    void fetch(`/api/canvases/${encodeURIComponent(canvas.id)}/messages`).then(async (response) => {
      if (!response.ok) throw new Error('Could not load chat')
      const result = await response.json() as { messages: Message[]; discord?: { channelId: string } | null }
      if (!disposed) { merge(result.messages); setDiscordLinked(Boolean(result.discord)) }
    }).catch((reason) => { if (!disposed) setError(reason instanceof Error ? reason.message : 'Could not load chat') })
    connect()
    return () => { disposed = true; clearTimeout(retry); socket?.close() }
  }, [canvas.id])

  const send = async () => {
    const value = content.trim()
    if (!value || sending) return
    setSending(true); setError('')
    try {
      const response = await fetch(`/api/canvases/${encodeURIComponent(canvas.id)}/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-fieldnotes-device': getDeviceId() },
        body: JSON.stringify({ content: value, authorName: 'You', replyTo: replyTo?.id }),
      })
      const result = await response.json() as { message?: Message; error?: string }
      if (!response.ok || !result.message) throw new Error(result.error ?? 'Could not send message')
      setMessages((current) => current.some((item) => item.id === result.message!.id) ? current : [...current, result.message!])
      setContent(''); setReplyTo(undefined)
      requestAnimationFrame(() => list.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' }))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send message') }
    finally { setSending(false) }
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="border-b border-rule px-3 py-2.5">
      <div className="flex items-center justify-between"><span className="truncate text-[11px] font-semibold">{canvas.title}</span><span className={`flex items-center gap-1 text-[9px] ${connected ? 'text-emerald-700' : 'text-stone-400'}`}>{connected ? <Check size={11}/> : <RefreshCw size={11}/>} {connected ? 'Live' : 'Connecting'}</span></div>
      <button className={`mt-2 w-full rounded-md border px-2 py-1.5 text-[9px] font-semibold ${discordLinked ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`} onClick={() => setConnectOpen(true)}>{discordLinked ? 'Discord connected · Change channel' : 'Connect Discord'}</button>
      <button className="mt-1 flex items-center gap-1 border-0 bg-transparent p-0 text-[9px] text-stone-400" onClick={() => void navigator.clipboard.writeText(canvas.id)} title="Copy canvas ID"><Copy size={10}/> Canvas ID: {canvas.id}</button>
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
            {message.attachments.map((attachment) => <a className="mr-1 inline-flex items-center gap-1 text-[9px] text-emerald-800 underline" href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}>{attachment.name}<ExternalLink size={9}/></a>)}
            <div className="flex items-center gap-2"><button className="invisible flex items-center gap-1 border-0 bg-transparent p-0 text-[8px] text-stone-500 group-hover:visible" onClick={() => setReplyTo(message)}><MessageCircleReply size={10}/> Reply</button>{message.origin === 'website' && <span className={`text-[8px] ${message.syncStatus === 'failed' ? 'text-red-600' : 'text-stone-400'}`}>{message.syncStatus === 'unlinked' ? 'Site only' : message.syncStatus === 'pending' ? 'Sending to Discord…' : message.syncStatus === 'failed' ? 'Discord delivery failed' : 'Synced'}</span>}</div>
          </div>
        </div>
      </article>
    }}/>
    {replyTo && <div className="flex items-center justify-between border-t border-rule bg-stone-100 px-3 py-1.5 text-[9px] text-stone-500"><span className="truncate">Replying to {replyTo.authorName}: {replyTo.content}</span><button className="border-0 bg-transparent" onClick={() => setReplyTo(undefined)}>×</button></div>}
    {error && <div role="alert" className="flex items-center gap-1 px-3 py-1 text-[9px] text-red-700"><Unplug size={10}/>{error}</div>}
    <form className="m-3 rounded-lg border border-stone-300 bg-white p-2" onSubmit={(event) => { event.preventDefault(); void send() }}>
      <textarea className="h-14 w-full resize-none border-0 bg-transparent text-[11px] outline-none" maxLength={2000} placeholder="Message this canvas and Discord…" value={content} onChange={(event) => setContent(event.target.value)}/>
      <div className="flex items-center justify-between"><span className="text-[8px] text-stone-400">{content.length}/2000</span><button className="grid size-7 place-items-center rounded-md border-0 bg-forest text-white disabled:opacity-40" disabled={!content.trim() || sending} aria-label="Send message"><Send size={13}/></button></div>
    </form>
    <DiscordConnectModal canvasId={canvas.id} open={connectOpen} onClose={() => setConnectOpen(false)} onLinked={() => setDiscordLinked(true)}/>
  </div>
}

function activeCanvas() {
  const stored = localStorage.getItem('fieldnotes:active-canvas')
  return stored ? JSON.parse(stored) as { id: string; title: string } : { id: 'attention', title: 'Designing for attention' }
}
