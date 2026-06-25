import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { BookmarkPlus, Check, ExternalLink, Forward, Link2, Lock, MessageCircleReply, MoreVertical, Paperclip, RefreshCw, Send, Settings, Smile, SmilePlus, Trash2, Unplug, UserCheck, UserPlus } from 'lucide-react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { getDeviceId, getGuestName, getOwnerToken, setGuestName as saveGuestName } from '../services/api'
import DiscordConnectModal from './DiscordConnectModal'
import DiscordIdentity, { type DiscordUser } from './DiscordIdentity'
import { CloudinaryMediaStorage, type StoredMedia } from '../services/media'
import { canvases, resources as defaultResources } from '../data'
import { showConfirm, showToast } from './Popups'

type Message = {
  id: string; origin: 'website' | 'discord'; authorId: string; authorName: string; authorAvatar?: string;
  content: string; replyTo?: string; attachments: Array<{ id: string; name: string; url: string; contentType?: string }>;
  reactions: Array<{ emoji: string; count: number; participants: string[] }>;
  discordMessageId?: string; discordChannelId?: string; discordGuildId?: string; createdAt: number; editedAt?: number;
  deleted: boolean; syncStatus: 'local' | 'pending' | 'synced' | 'unlinked' | 'failed'
}

const QUICK_REACTIONS = ['👍', '❤️', '😂']
const chatScrollPositions = new Map<string, number>()
const EMOJI_GROUPS = [
  ['Smileys', '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪'],
  ['People', '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 👃 🧠 🫀 🫁 🦷 👀 👁️ 👅 👄'],
  ['Nature', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪲 🕷️ 🦂 🐢 🐍 🦎 🐙 🦑 🦀 🐠 🐟 🐬 🐳 🌸 🌹 🌺 🌻 🌼 🌷 🌱 🌲 🌳 🌴 🌵 🍀 🍁 🍂 🍃'],
  ['Food', '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🧀 🥚 🍳 🧇 🥞 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍣 🍱 🍛 🍚 🍰 🎂 🍪 🍩 🍫 🍿 ☕️ 🍺 🍷'],
  ['Activities', '⚽️ 🏀 🏈 ⚾️ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🥅 ⛳️ skateboard 🛼 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏊 🚴 🧗 🎮 🕹️ 🎲 ♟️ 🎯 🎳 🎨 🎭 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻'],
  ['Objects', '⌚️ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 📷 📸 📹 🎥 📞 ☎️ 📺 📻 ⏰ ⌛️ 💡 🔦 🕯️ 🧯 💸 💵 💳 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧱 ⛓️ 🧲 🔫 💣 🧨 🪓 🔪 🗡️ 🛡️ 🚬 ⚰️ 🔮 📿 💈 🔭 🔬 💊 🩹 🩺 🔑 🗝️ 🚪 🪑 🛋️ 🛏️'],
  ['Symbols', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈️ ♉️ ♊️ ♋️ ♌️ ♍️ ♎️ ♏️ ♐️ ♑️ ♒️ ♓️ 🆔 ⚛️ ☢️ ☣️ 📴 📳 🈶 🈚️ 🉐️ ㊙️ ㊗️ 🆘 ❌ ⭕️ 🛑 ⛔️ 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 ⚠️ ✅ ❎ 🌐 💠 Ⓜ️'],
] as const

export default function CanvasChat() {
  const linkedMessageId = useMemo(() => window.location.hash.match(/^#discord-message-([0-9a-f-]{36})$/)?.[1] ?? '', [])
  const [canvas, setCanvas] = useState(() => activeCanvas())
  const [messages, setMessages] = useState<Message[]>([])
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState<Message>()
  const [connected, setConnected] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploads, setUploads] = useState<StoredMedia[]>([])
  const [uploading, setUploading] = useState(false)
  const [typers, setTypers] = useState(() => new Map<string, { name: string; expires: number }>())
  const [popover, setPopover] = useState<{ type: 'emoji' | 'more'; message?: Message; top: number; left: number }>()
  const [linkReady, setLinkReady] = useState(() => !linkedMessageId)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [guestName, setGuestName] = useState(getGuestName)
  const [myReactions, setMyReactions] = useState(() => new Set<string>())
  const [error, setError] = useState('')
  const [discordLinked, setDiscordLinked] = useState(false)
  const [discordInvite, setDiscordInvite] = useState('')
  const [discordChannelName, setDiscordChannelName] = useState('')
  const [discordAuthorization, setDiscordAuthorization] = useState('')
  const [canModerate, setCanModerate] = useState(false)
  const [identity, setIdentity] = useState<DiscordUser | null>(null)
  const [connectOpen, setConnectOpen] = useState(() => new URL(window.location.href).searchParams.has('discordConnect'))
  const [headerMenu, setHeaderMenu] = useState<{ top: number; left: number }>()
  const [reactionHover, setReactionHover] = useState<{ messageId: string; emoji: string; participants: string[]; top: number; left: number }>()
  const [online, setOnline] = useState<Array<{ id: string; name: string; avatar?: string }>>([])
  const [hashTarget, setHashTarget] = useState(() => window.location.hash)
  
  // Custom chat settings states
  const [settings, setSettings] = useState<{ locked: boolean; loginOnly: boolean }>({ locked: false, loginOnly: false })
  const [isInviteValid, setIsInviteValid] = useState(false)

  const list = useRef<VirtuosoHandle>(null)
  const restoredScrollCanvas = useRef('')
  const linkedMessageHandled = useRef(false)
  const socketRef = useRef<WebSocket | undefined>(undefined)
  const typingSentAt = useRef(0)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const headerMenuRef = useRef<HTMLDivElement>(null)
  const storage = useRef(new CloudinaryMediaStorage())
  const [ownerToken, setOwnerToken] = useState(getOwnerToken)
  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages])

  useEffect(() => {
    const syncOwner = () => {
      const token = getOwnerToken()
      setOwnerToken(token)
      if (!token) {
        setCanModerate(false)
        window.dispatchEvent(new CustomEvent('fieldnotes:moderation-changed', { detail: false }))
      }
    }
    window.addEventListener('fieldnotes:owner-session-changed', syncOwner)
    return () => window.removeEventListener('fieldnotes:owner-session-changed', syncOwner)
  }, [])

  const [inviteToken, setInviteToken] = useState(() => {
    const url = new URL(window.location.href)
    return url.searchParams.get('invite') || localStorage.getItem('fieldnotes:invite-token:' + activeCanvas().id) || ''
  })

  useEffect(() => {
    const url = new URL(window.location.href)
    const urlToken = url.searchParams.get('invite')
    if (urlToken) {
      localStorage.setItem('fieldnotes:invite-token:' + canvas.id, urlToken)
      url.searchParams.delete('invite')
      window.history.replaceState({}, '', url.toString())
      setInviteToken(urlToken)
    } else {
      const stored = localStorage.getItem('fieldnotes:invite-token:' + canvas.id) || ''
      setInviteToken(stored)
    }
  }, [canvas.id])

  const canWrite = useMemo(() => {
    if (canModerate) return true
    if (isInviteValid) return true
    if (settings.locked) return false
    if (settings.loginOnly && !identity) return false
    return true
  }, [canModerate, isInviteValid, settings.locked, settings.loginOnly, identity])

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
      const savedInvite = localStorage.getItem('fieldnotes:invite-token:' + canvas.id) ?? ''
      if (savedInvite) url.searchParams.set('invite', savedInvite)
      if (ownerToken) url.searchParams.set('ownerToken', ownerToken)
      socket = new WebSocket(url)
      socketRef.current = socket
      socket.onopen = () => { attempts = 0; setConnected(true) }
      socket.onmessage = (event) => {
        if (event.data === 'pong') return
        const payload = JSON.parse(event.data) as { type: string; message?: Message; messages?: Message[]; messageId?: string; userId?: string; authorName?: string; settings?: { locked: boolean; loginOnly: boolean }; participants?: Array<{ id: string; name: string; avatar?: string }> }
        if (payload.messages) merge(payload.messages)
        if (payload.message?.deleted) setMessages((current) => current.filter((message) => message.id !== payload.message!.id))
        else if (payload.message) merge([payload.message])
        if (payload.type === 'delete' && payload.messageId) setMessages((current) => current.filter((message) => message.id !== payload.messageId))
        if (payload.type === 'typing' && payload.authorName && payload.userId) {
          setTypers((current) => new Map(current).set(payload.userId!, { name: payload.authorName!, expires: Date.now() + 5_000 }))
        }
        if (payload.type === 'settings' && payload.settings) {
          setSettings(payload.settings)
        }
        if (payload.type === 'presence' && payload.participants) setOnline(payload.participants)
      }
      socket.onclose = () => {
        setConnected(false)
        if (!disposed) retry = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** attempts++))
      }
      socket.onerror = () => socket?.close()
    }
    const savedInvite = localStorage.getItem('fieldnotes:invite-token:' + canvas.id) ?? ''
    void fetch(`/api/canvases/${encodeURIComponent(canvas.id)}/messages`, {
      headers: {
        'x-fieldnotes-owner-token': ownerToken,
        'x-fieldnotes-invite-token': savedInvite
      }
    }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load chat')
      const result = await response.json() as {
        messages: Message[];
        discord?: { channelId: string; guildId: string; inviteUrl?: string; channelName?: string } | null;
        canModerate?: boolean;
        settings?: { locked: boolean; loginOnly: boolean; canvasMode?: 'public' | 'login' | 'readonly'; resourceMode?: 'public' | 'login' | 'readonly'; discussionMode?: 'public' | 'login' | 'readonly'; llmMode?: 'public' | 'login' | 'readonly' };
        isInviteValid?: boolean;
        access?: { canvas: boolean; resources: boolean; discussion: boolean; llm: boolean; chat: boolean };
      }
      if (!disposed) {
        merge(result.messages); setCanModerate(Boolean(result.canModerate))
        window.dispatchEvent(new CustomEvent('fieldnotes:moderation-changed', { detail: Boolean(result.canModerate) }))
        if (result.access) window.dispatchEvent(new CustomEvent('fieldnotes:access-changed', { detail: result.access }))
        setDiscordLinked(Boolean(result.discord)); setDiscordInvite(result.discord?.inviteUrl ?? ''); setDiscordChannelName(result.discord?.channelName ?? '')
        if (result.settings) setSettings(result.settings)
        if (result.settings && result.access) window.dispatchEvent(new CustomEvent('fieldnotes:permissions-changed', { detail: { settings: result.settings, access: result.access } }))
        if (result.isInviteValid !== undefined) {
          setIsInviteValid(result.isInviteValid)
          if (!result.isInviteValid && savedInvite) {
            localStorage.removeItem('fieldnotes:invite-token:' + canvas.id)
          }
        }
      }
      const linkedId = window.location.hash.match(/^#discord-message-([0-9a-f-]{36})$/)?.[1]
      if (linkedId && !result.messages.some((message) => message.id === linkedId)) {
        const linkedResponse = await fetch('/api/canvases/' + encodeURIComponent(canvas.id) + '/messages/' + linkedId)
        const linkedResult = await linkedResponse.json() as { message?: Message }
        if (!disposed && linkedResponse.ok && linkedResult.message) merge([linkedResult.message])
        else if (!disposed) setLinkReady(true)
      }
      if (result.discord && !result.discord.inviteUrl) {
        const inviteResponse = await fetch('/api/canvases/' + encodeURIComponent(canvas.id) + '/discord-invite', { method: 'POST', headers: { 'x-fieldnotes-owner-token': ownerToken } })
        const invite = await inviteResponse.json() as { inviteUrl?: string; authorizationUrl?: string }
        if (!disposed && inviteResponse.ok) setDiscordInvite(invite.inviteUrl ?? '')
        else if (!disposed) setDiscordAuthorization(invite.authorizationUrl ?? '')
      }
    }).catch((reason) => { if (!disposed) { setLinkReady(true); setError(reason instanceof Error ? reason.message : 'Could not load chat') } })
    connect()
    return () => { disposed = true; clearTimeout(retry); socket?.close(); socketRef.current = undefined }
  }, [canvas.id, ownerToken])

  useEffect(() => {
    const timer = setInterval(() => setTypers((current) => {
      const next = new Map([...current].filter(([, typer]) => typer.expires > Date.now()))
      return next.size === current.size ? current : next
    }), 1_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!messages.length) return
    localStorage.setItem(`fieldnotes:discord-messages:${canvas.id}`, JSON.stringify(messages.slice(-200).map((message) => ({
      id: message.id,
      origin: message.origin,
      authorName: message.authorName,
      authorAvatar: message.authorAvatar,
      content: message.content,
      createdAt: message.createdAt,
    }))))
  }, [canvas.id, messages])

  useLayoutEffect(() => {
    const element = composerRef.current
    if (!element) return
    element.style.height = 'auto'
    const height = Math.min(160, Math.max(56, element.scrollHeight))
    element.style.height = height + 'px'
    element.style.overflowY = element.scrollHeight > 160 ? 'auto' : 'hidden'
  }, [content])

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (popoverRef.current?.contains(target) || headerMenuRef.current?.contains(target)) return
      setPopover(undefined)
      setHeaderMenu(undefined)
      setReactionHover(undefined)
    }
    window.addEventListener('pointerdown', closeMenus)
    return () => window.removeEventListener('pointerdown', closeMenus)
  }, [])

  useEffect(() => {
    const hashChanged = () => {
      linkedMessageHandled.current = false
      setHashTarget(window.location.hash)
    }
    window.addEventListener('hashchange', hashChanged)
    return () => window.removeEventListener('hashchange', hashChanged)
  }, [])

  useEffect(() => {
    const match = hashTarget.match(/^#discord-message-([0-9a-f-]{36})$/)
    const index = match ? messages.findIndex((message) => message.id === match[1]) : -1
    if (match && index >= 0 && !linkedMessageHandled.current) {
      list.current?.scrollToIndex({ index, align: 'center', behavior: 'auto' })
      focusMessageWhenVisible(match[1], 12, () => { linkedMessageHandled.current = true; setLinkReady(true) }, 'auto')
    }
  }, [hashTarget, messages])

  useEffect(() => {
    const match = hashTarget.match(/^#discord-message-([0-9a-f-]{36})$/)
    const id = match?.[1]
    if (!id || messages.some((message) => message.id === id)) return
    let disposed = false
    setLinkReady(false)
    void fetch('/api/canvases/' + encodeURIComponent(canvas.id) + '/messages/' + id)
      .then(async (response) => {
        const result = await response.json() as { message?: Message }
        if (!disposed && response.ok && result.message) setMessages((current) => current.some((message) => message.id === result.message!.id) ? current : [...current, result.message!].sort((a, b) => a.createdAt - b.createdAt))
        else if (!disposed) setLinkReady(true)
      })
      .catch(() => { if (!disposed) setLinkReady(true) })
    return () => { disposed = true }
  }, [canvas.id, hashTarget, messages])

  useLayoutEffect(() => {
    if (!messages.length || linkedMessageId || restoredScrollCanvas.current === canvas.id) return
    restoredScrollCanvas.current = canvas.id
    const index = chatScrollPositions.get(canvas.id)
    if (index === undefined) return
    requestAnimationFrame(() => list.current?.scrollToIndex({ index: Math.min(index, messages.length - 1), align: 'start', behavior: 'auto' }))
  }, [canvas.id, linkedMessageId, messages.length])

  const jumpToMessage = (id: string) => {
    const index = messages.findIndex((message) => message.id === id)
    if (index < 0) return
    list.current?.scrollToIndex({ index, align: 'center', behavior: 'smooth' })
    focusMessageWhenVisible(id)
  }

  const send = async () => {
    const value = content.trim()
    if ((!value && !uploads.length) || sending) return
    setSending(true); setError('')
    try {
      const savedInvite = localStorage.getItem('fieldnotes:invite-token:' + canvas.id) ?? ''
      const response = await fetch(`/api/canvases/${encodeURIComponent(canvas.id)}/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-fieldnotes-device': getDeviceId(), 'x-fieldnotes-owner-token': ownerToken, 'x-fieldnotes-invite-token': savedInvite },
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

  const insertEmoji = (emoji: string) => {
    const textarea = composerRef.current
    if (!textarea) {
      setContent((prev) => prev + emoji)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const before = text.substring(0, start)
    const after = text.substring(end, text.length)
    const newContent = before + emoji + after
    setContent(newContent)
    
    // Set focus and cursor position back after React updates state
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + emoji.length, start + emoji.length)
    }, 0)
  }

  const toggleComposerEmoji = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const size = { width: 288, height: 304 }
    const left = Math.max(8, Math.min(window.innerWidth - size.width - 8, rect.left + rect.width / 2 - size.width / 2))
    const top = Math.max(8, Math.min(window.innerHeight - size.height - 8, rect.top - size.height - 6))
    setHeaderMenu(undefined)
    setPopover((current) => current?.type === 'emoji' && !current.message ? undefined : { type: 'emoji', top, left })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  const react = async (message: Message, emoji: string) => {
    const key = message.id + ':' + emoji
    const active = !myReactions.has(key)
    setMyReactions((current) => { const next = new Set(current); active ? next.add(key) : next.delete(key); return next })
    const savedInvite = localStorage.getItem('fieldnotes:invite-token:' + canvas.id) ?? ''
    const response = await fetch('/api/canvases/' + encodeURIComponent(canvas.id) + '/messages/' + message.id + '/reactions', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-fieldnotes-device': getDeviceId(), 'x-fieldnotes-owner-token': ownerToken, 'x-fieldnotes-invite-token': savedInvite },
      body: JSON.stringify({ emoji, guestName }),
    })
    const result = await response.json() as { message?: Message; active?: boolean; error?: string }
    if (!response.ok || !result.message) { setError(result.error ?? 'Could not update reaction'); return }
    setMyReactions((current) => { const next = new Set(current); result.active ? next.add(key) : next.delete(key); return next })
    setMessages((current) => current.map((item) => item.id === result.message!.id ? result.message! : item))
  }

  const messageUrl = (message: Message) => {
    const url = new URL(window.location.href)
    url.searchParams.set('canvas', canvas.id)
    url.hash = 'discord-message-' + message.id
    return url.toString()
  }

  const copyMessageLink = async (message: Message) => {
    await navigator.clipboard.writeText(messageUrl(message))
    setPopover(undefined)
    showToast('Link copied')
  }

  const forwardMessage = async (message: Message) => {
    const data = { title: 'Message from ' + message.authorName, text: message.content, url: messageUrl(message) }
    if (navigator.share) await navigator.share(data)
    else await navigator.clipboard.writeText(data.text + '\n' + data.url)
  }

  const deleteMessage = async (message: Message) => {
    if (!canModerate) return
    if (!await showConfirm({
      title: 'Delete message?',
      message: 'This removes the message from Fieldnotes and Discord.',
      confirmLabel: 'Delete message',
      cancelLabel: 'Keep message',
      tone: 'danger',
    })) return
    const response = await fetch('/api/canvases/' + encodeURIComponent(canvas.id) + '/messages/' + message.id, {
      method: 'DELETE', headers: { 'x-fieldnotes-device': getDeviceId(), 'x-fieldnotes-owner-token': ownerToken },
    })
    const result = await response.json() as { message?: Message; error?: string }
    if (!response.ok || !result.message) { setError(result.error ?? 'Could not delete message'); return }
    setMessages((current) => current.filter((item) => item.id !== result.message!.id))
    setPopover(undefined)
    showToast('Message deleted')
  }

  const saveAsResource = (message: Message) => {
    if (!canModerate) return
    const key = 'fieldnotes:resources'
    const current = JSON.parse(localStorage.getItem(key) ?? JSON.stringify(defaultResources)) as Array<Record<string, unknown>>
    const resource = {
      id: 'res-chat-' + crypto.randomUUID(), kind: 'chat', title: 'Chat snippet from ' + message.authorName,
      meta: 'Chat snippet · Saved ' + new Date().toLocaleDateString(), accent: '#5865f2',
      url: messageUrl(message), content: message.authorName + ' · ' + new Date(message.createdAt).toLocaleString() + '\n\n' + message.content,
    }
    localStorage.setItem(key, JSON.stringify([resource, ...current]))
    window.dispatchEvent(new Event('fieldnotes:resources-changed'))
    setPopover(undefined)
    showToast('Saved to resources')
  }

  const saveConversation = async () => {
    if (!canModerate) return
    if (!await showConfirm({
      title: 'Save conversation as a resource?',
      message: 'This copies the retained conversation into the resources list.',
      confirmLabel: 'Save conversation',
      cancelLabel: 'Cancel',
    })) return
    setSaveState('saving')
    try {
      const collected: Message[] = []
      let before: number | undefined
      while (true) {
        const response = await fetch('/api/canvases/' + encodeURIComponent(canvas.id) + '/messages' + (before ? '?before=' + before : ''))
        if (!response.ok) throw new Error('Could not load the complete conversation')
        const result = await response.json() as { messages: Message[] }
        collected.unshift(...result.messages)
        if (result.messages.length < 50) break
        before = result.messages[0]?.createdAt
        if (!before) break
      }
      const key = 'fieldnotes:resources'
      const current = JSON.parse(localStorage.getItem(key) ?? JSON.stringify(defaultResources)) as Array<Record<string, unknown>>
      const savedContent = collected.map((message) => message.authorName + ' · ' + new Date(message.createdAt).toLocaleString() + '\n' + (message.content || '[Attachment]')).join('\n\n')
      const resource = { id: 'res-chat-' + crypto.randomUUID(), kind: 'chat', title: 'Conversation: ' + canvas.title, meta: 'Chat · ' + collected.length + ' messages', accent: '#5865f2', content: savedContent }
      localStorage.setItem(key, JSON.stringify([resource, ...current]))
      window.dispatchEvent(new Event('fieldnotes:resources-changed'))
      setSaveState('saved')
      showToast('Saved to resources')
    } catch (reason) {
      setSaveState('error')
      setError(reason instanceof Error ? reason.message : 'Could not save conversation')
    } finally {
      window.setTimeout(() => setSaveState('idle'), 3_000)
    }
  }

  const togglePopover = (type: 'emoji' | 'more', message: Message, event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const size = type === 'emoji' ? { width: 288, height: 304 } : { width: 188, height: 136 }
    const left = Math.max(8, Math.min(window.innerWidth - size.width - 8, rect.left + rect.width / 2 - size.width / 2))
    const top = Math.max(8, Math.min(window.innerHeight - size.height - 8, rect.bottom + 6))
    setHeaderMenu(undefined)
    setPopover((current) => current?.type === type && current.message?.id === message.id ? undefined : { type, message, top, left })
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="border-b border-rule px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold">{discordChannelName ? `#${discordChannelName}` : canvas.title}</div>
          <div className={`mt-0.5 flex items-center gap-1 text-[8px] ${connected ? 'text-emerald-700' : 'text-stone-400'}`}>{connected ? <Check size={10} /> : <RefreshCw size={10} />} {connected ? 'Live' : 'Connecting'}{online.length > 0 && <span title={online.map((person) => person.name).join(', ')}>· {online.length} online</span>}{discordLinked && <span>· Discord linked</span>}{saveState !== 'idle' && <span>· {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved to resources' : 'Save failed'}</span>}</div>
        </div>
        <div className="ml-auto flex -space-x-1" aria-label={`${online.length} people online`}>{online.slice(0, 3).map((person) => person.avatar ? <img key={person.id} className="size-6 rounded-full border-2 border-paper object-cover" src={person.avatar} alt={person.name} title={`${person.name} · online`}/> : <span key={person.id} className="grid size-6 place-items-center rounded-full border-2 border-paper bg-emerald-100 text-[7px] font-bold text-emerald-900" title={`${person.name} · online`}>{person.name.slice(0, 2).toUpperCase()}</span>)}</div>
        <button className="grid size-7 place-items-center rounded-md border border-stone-200 bg-white text-stone-500 hover:bg-stone-50" aria-label="More channel options" onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const width = 224
          const height = canModerate ? 230 : 124
          setPopover(undefined)
          setHeaderMenu((current) => current ? undefined : {
            left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width)),
            top: Math.max(8, Math.min(window.innerHeight - height - 8, rect.bottom + 6)),
          })
        }}><MoreVertical size={16} /></button>
      </div>
    </div>
    <Virtuoso ref={list} className={'min-h-0 flex-1 ' + (linkReady ? '' : 'invisible')} data={messages} followOutput={false} rangeChanged={(range) => chatScrollPositions.set(canvas.id, range.startIndex)} itemContent={(_, message) => {
      const parent = message.replyTo ? byId.get(message.replyTo) : undefined
      return <article
        id={`discord-message-${message.id}`}
        className="deep-link-target group relative px-3 py-2 hover:bg-stone-100/70"
        data-discord-author-name={message.authorName}
        data-discord-author-avatar={message.authorAvatar ?? ''}
        data-discord-content={message.content}
        data-discord-origin={message.origin}
        data-discord-created-at={message.createdAt}
        onMouseEnter={() => { if (popover && popover.message?.id !== message.id) setPopover(undefined) }}
      >
        <div className="invisible absolute -top-3 right-2 z-20 flex items-center rounded-md border border-stone-200 bg-white p-0.5 shadow-sm group-hover:visible group-focus-within:visible">
          {canWrite && QUICK_REACTIONS.map((emoji) => <button className="grid size-7 place-items-center rounded border-0 bg-transparent text-sm hover:bg-stone-100" key={emoji} title={'React ' + emoji} onClick={() => void react(message, emoji)}>{emoji}</button>)}
          {canWrite && <button className="grid size-7 place-items-center rounded border-0 bg-transparent text-stone-500 hover:bg-stone-100" title="More reactions" onClick={(event) => togglePopover('emoji', message, event)}><SmilePlus size={14} /></button>}
          {canWrite && <button className="grid size-7 place-items-center rounded border-0 bg-transparent text-stone-500 hover:bg-stone-100" title="Reply" onClick={() => setReplyTo(message)}><MessageCircleReply size={14} /></button>}
          <button className="grid size-7 place-items-center rounded border-0 bg-transparent text-stone-500 hover:bg-stone-100" title="Forward" onClick={() => void forwardMessage(message)}><Forward size={14} /></button>
          <button className="grid size-7 place-items-center rounded border-0 bg-transparent text-stone-500 hover:bg-stone-100" title="More" onClick={(event) => togglePopover('more', message, event)}><MoreVertical size={15} /></button>
        </div>
        {parent && <span aria-hidden="true" className="pointer-events-none absolute left-[25px] top-4 h-[14px] w-[31px] rounded-tl-xl border-l-2 border-t-2 border-stone-300" />}
        {parent && <button className="relative z-10 mb-0.5 ml-9 flex max-w-[calc(100%-2.25rem)] items-center gap-1.5 truncate border-0 bg-transparent p-0 text-left text-[9px] text-stone-400 hover:text-stone-600" onClick={() => jumpToMessage(parent.id)}>{parent.authorAvatar ? <span className="relative z-20 grid size-4 place-items-center rounded-full bg-paper"><img className="size-4 rounded-full" src={parent.authorAvatar} alt="" /></span> : <span className="relative z-20 grid size-4 place-items-center rounded-full bg-stone-200 text-[6px]">{parent.authorName.slice(0, 2).toUpperCase()}</span>}<strong>{parent.authorName}</strong><span className="truncate">{parent.content || 'Attachment'}</span></button>}
        <div className="flex gap-2">
          {message.authorAvatar ? <img src={message.authorAvatar} alt="" className="size-7 !z-10 rounded-full" /> : <span className="avatar avatar-sage">{message.authorName.slice(0, 2).toUpperCase()}</span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5"><strong className="truncate text-[10px]">{message.authorName}</strong>{message.origin === 'discord' && <span className="rounded bg-indigo-100 px-1 text-[7px] font-bold text-indigo-700">DISCORD</span>}<time className="text-[8px] text-stone-400">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>{message.origin === 'website' && message.syncStatus !== 'synced' && <span className={`text-[8px] ${message.syncStatus === 'failed' ? 'text-red-600' : 'text-stone-400'}`}>· {message.syncStatus === 'unlinked' ? 'Site only' : message.syncStatus === 'pending' ? 'Syncing…' : 'Discord delivery failed'}</span>}</div>
            <p className="my-1 whitespace-pre-wrap font-serif text-xs leading-relaxed text-stone-700">{message.content}</p>
            {message.attachments.map(renderAttachment)}
            <div className="my-1 flex flex-wrap gap-1">{(message.reactions ?? []).map((reaction) => <button key={reaction.emoji} aria-label={reaction.emoji + ' reaction'} className={'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] ' + (myReactions.has(message.id + ':' + reaction.emoji) ? 'border-indigo-300 bg-indigo-50' : 'border-stone-200 bg-white')} onMouseEnter={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setReactionHover({
                messageId: message.id,
                emoji: reaction.emoji,
                participants: reaction.participants ?? [],
                top: Math.max(8, Math.min(window.innerHeight - 48, rect.bottom + 6)),
                left: Math.max(8, Math.min(window.innerWidth - 240, rect.left)),
              })
            }} onMouseLeave={() => setReactionHover(undefined)} onClick={() => canWrite && void react(message, reaction.emoji)} disabled={!canWrite}>{renderEmoji(reaction.emoji)} {reaction.count}</button>)}</div>
          </div>
        </div>
      </article>
    }} />
    {error && <div role="alert" className="flex items-center gap-1 px-3 py-1 text-[9px] text-red-700"><Unplug size={10} />{error}</div>}
    <div className="min-h-4 px-3 text-[9px] italic text-stone-400">{typingLabel([...typers.values()].map((typer) => typer.name))}</div>
    {canWrite && <div className="flex items-center justify-between border-t border-rule px-3 pt-2">
      {identity ? <span className="text-[9px] text-stone-400">Posting as {identity.displayName}</span> : <label className="flex items-center gap-1 text-[9px] text-stone-400">Posting as <input className="w-28 rounded border border-stone-200 bg-white px-1.5 py-1 text-[9px] text-stone-700" maxLength={32} value={guestName} onChange={(event) => setGuestName(event.target.value)} onBlur={() => setGuestName(saveGuestName(guestName))} /></label>}
      <DiscordIdentity compact onChange={(next) => setIdentity(next)} />
    </div>}
    {canWrite
      ? <form className="m-3 mt-2 rounded-lg border border-stone-300 bg-white p-2" onSubmit={(event) => { event.preventDefault(); void send() }}>
          {replyTo && <div className="-mx-2 -mt-2 mb-2 flex items-center gap-2 rounded-t-lg border-b border-stone-200 bg-stone-50 px-2 py-1.5 text-[9px]">{replyTo.authorAvatar ? <img className="size-5 rounded-full" src={replyTo.authorAvatar} alt="" /> : <span className="grid size-5 place-items-center rounded-full bg-stone-200 text-[7px]">{replyTo.authorName.slice(0, 2).toUpperCase()}</span>}<MessageCircleReply size={11} className="shrink-0 text-indigo-500" /><button type="button" className="min-w-0 flex-1 truncate border-0 bg-transparent text-left text-stone-500" onClick={() => jumpToMessage(replyTo.id)}>Replying to <strong className="text-stone-700">{replyTo.authorName}</strong> · {replyTo.content || 'Attachment'}</button><button type="button" className="grid size-5 place-items-center border-0 bg-transparent text-stone-400" onClick={() => setReplyTo(undefined)}>×</button></div>}
          <textarea ref={composerRef} rows={1} className="w-full resize-none border-0 bg-transparent text-[11px] outline-none" maxLength={2000} placeholder="Message this canvas and Discord…" value={content} onChange={(event) => { setContent(event.target.value); announceTyping() }} onKeyDown={handleKeyDown} />
          {uploads.length > 0 && <div className="mb-1 flex flex-wrap gap-1">{uploads.map((file) => <button type="button" className="rounded bg-stone-100 px-1.5 py-1 text-[8px]" key={file.id} onClick={() => setUploads((current) => current.filter((item) => item.id !== file.id))}>{file.name} ×</button>)}</div>}
          <div className="flex items-center justify-between"><span className="text-[8px] text-stone-400">{content.length}/2000</span><div className="flex items-center gap-1"><input ref={fileInput} type="file" multiple hidden onChange={(event) => void uploadFiles(event.target.files)} /><button type="button" className="grid size-7 place-items-center rounded-md border-0 bg-stone-100 text-stone-600 disabled:opacity-40" disabled={uploading || uploads.length >= 10} onClick={() => fileInput.current?.click()} aria-label="Attach files"><Paperclip size={13} /></button><button type="button" className="grid size-7 place-items-center rounded-md border-0 bg-stone-100 text-stone-600" onClick={toggleComposerEmoji} aria-label="Insert emoji"><Smile size={13} /></button><button className="grid size-7 place-items-center rounded-md border-0 bg-forest text-white disabled:opacity-40" disabled={(!content.trim() && !uploads.length) || sending || uploading} aria-label="Send message"><Send size={13} /></button></div></div>
        </form>
      : <div className="m-3 mt-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-center">
          {settings.locked && !settings.loginOnly && <p className="flex items-center justify-center gap-1.5 text-[10px] text-stone-500"><Lock size={11} /> This chat is locked. Only the admin can post.</p>}
          {settings.loginOnly && !identity && (
            <div className="flex flex-col items-center gap-2">
              <p className="flex items-center gap-1.5 text-[10px] text-stone-500"><UserCheck size={11} /> Sign in to participate in this chat.</p>
              <DiscordIdentity compact={false} onChange={(next) => setIdentity(next)} />
            </div>
          )}
          {settings.locked && settings.loginOnly && identity && <p className="flex items-center justify-center gap-1.5 text-[10px] text-stone-500"><Lock size={11} /> This chat is locked. Only the admin can post.</p>}
        </div>
    }
    <DiscordConnectModal canvasId={canvas.id} open={connectOpen} onClose={() => setConnectOpen(false)} onLinked={() => {
      setDiscordLinked(true)
      void fetch('/api/canvases/' + encodeURIComponent(canvas.id) + '/discord-invite', { method: 'POST' }).then(async (response) => {
        const result = await response.json() as { inviteUrl?: string; authorizationUrl?: string }
        if (response.ok) setDiscordInvite(result.inviteUrl ?? '')
        else setDiscordAuthorization(result.authorizationUrl ?? '')
      })
    }} />
    {reactionHover && createPortal(<div className="fixed z-[1000] w-60 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[10px] shadow-xl" style={{ top: reactionHover.top, left: reactionHover.left }}>
      <div className="font-semibold text-stone-700">{renderEmoji(reactionHover.emoji)} Reaction</div>
      <div className="mt-1 truncate text-stone-500">{reactionHover.participants.length ? reactionHover.participants.join(', ') : 'No participants'}</div>
    </div>, document.body)}
    {popover && createPortal(popover.type === 'emoji'
      ? <div ref={popoverRef} className="fixed z-[1000] h-72 w-72 overflow-y-auto rounded-xl border border-stone-200 bg-white p-3 shadow-xl" style={{ top: popover.top, left: popover.left }}>{EMOJI_GROUPS.map(([label, emojis]) => <section className="mb-3" key={label}><h4 className="mb-1 text-[9px] font-bold uppercase tracking-wide text-stone-400">{label}</h4><div className="grid grid-cols-8 gap-0.5">{emojis.split(' ').map((emoji) => <button className="grid size-7 place-items-center rounded border-0 bg-transparent text-base hover:bg-stone-100" key={label + emoji} onClick={() => { if (popover.message) { void react(popover.message, emoji); } else { insertEmoji(emoji); } setPopover(undefined) }}>{emoji}</button>)}</div></section>)}</div>
      : <div ref={popoverRef} className="fixed z-[1000] w-48 rounded-lg border border-stone-200 bg-white p-1 text-[10px] shadow-xl" style={{ top: popover.top, left: popover.left }}>
        <button className="flex w-full items-center gap-2 rounded border-0 bg-transparent px-2 py-2 text-left hover:bg-stone-100" onClick={() => { if (popover.message) { void copyMessageLink(popover.message); setPopover(undefined) } }}><Link2 size={13} /> Copy message link</button>
        {canModerate && <button className="flex w-full items-center gap-2 rounded border-0 bg-transparent px-2 py-2 text-left hover:bg-stone-100" onClick={() => { if (popover.message) { saveAsResource(popover.message); setPopover(undefined) } }}><BookmarkPlus size={13} /> Save as resource</button>}
        {canModerate && <button className="flex w-full items-center gap-2 rounded border-0 bg-transparent px-2 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => { if (popover.message) { void deleteMessage(popover.message); } }}><Trash2 size={13} /> Delete message</button>}
      </div>, document.body)}
    {headerMenu && createPortal(<div ref={headerMenuRef} className="fixed z-[1000] w-56 rounded-lg border border-stone-200 bg-white p-1 text-[10px] shadow-xl" style={{ top: headerMenu.top, left: headerMenu.left }}>
      {discordInvite && <a className="flex w-full items-center gap-2 rounded border-0 bg-transparent px-2 py-2 text-left hover:bg-stone-100" href={discordInvite} target="_blank" rel="noreferrer" onClick={() => setHeaderMenu(undefined)}>Join Discord server <ExternalLink size={13} /></a>}
      {!discordInvite && discordAuthorization && <a className="flex w-full items-center gap-2 rounded border-0 bg-transparent px-2 py-2 text-left hover:bg-stone-100" href={discordAuthorization} target="_blank" rel="noreferrer" onClick={() => setHeaderMenu(undefined)}>Join Discord server <ExternalLink size={13} /></a>}
      {canModerate && <>
        <div className="mx-2 my-1 border-t border-stone-100" />
        <button className="flex w-full items-center gap-2 rounded border-0 bg-transparent px-2 py-2 text-left hover:bg-stone-100" onClick={() => { window.dispatchEvent(new CustomEvent('fieldnotes:open-permissions', { detail: 'settings' })); setHeaderMenu(undefined) }}><Settings size={13}/> Permissions</button>
        <button className="flex w-full items-center gap-2 rounded border-0 bg-transparent px-2 py-2 text-left hover:bg-stone-100" onClick={() => { window.dispatchEvent(new CustomEvent('fieldnotes:open-permissions', { detail: 'invite' })); setHeaderMenu(undefined) }}><UserPlus size={13}/> Create invite link</button>
        <div className="mx-2 my-1 border-t border-stone-100" />
        <button className="flex w-full items-center gap-2 rounded border-0 bg-transparent px-2 py-2 text-left hover:bg-stone-100" onClick={() => { void saveConversation(); setHeaderMenu(undefined) }} disabled={saveState !== 'idle'}>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved to resources' : saveState === 'error' ? 'Save failed' : <><BookmarkPlus size={13} /> Save conversation</>}</button>
      </>}
      <button className="flex w-full items-center gap-2 rounded border-0 bg-transparent px-2 py-2 text-left hover:bg-stone-100" onClick={() => { setConnectOpen(true); setHeaderMenu(undefined) }}>Change channel</button>
    </div>, document.body)}
  </div>
}

function activeCanvas() {
  const requested = new URL(window.location.href).searchParams.get('canvas')
  const linked = requested ? canvases.find((canvas) => canvas.id === requested) : undefined
  if (requested && /^[a-zA-Z0-9_-]{1,100}$/.test(requested)) return { id: requested, title: linked?.title ?? 'Linked canvas' }
  const stored = localStorage.getItem('fieldnotes:active-canvas')
  return stored ? JSON.parse(stored) as { id: string; title: string } : { id: 'attention', title: 'Designing for attention' }
}

function renderEmoji(emoji: string) {
  try { emoji = decodeURIComponent(emoji) } catch { /* Keep malformed identifiers visible. */ }
  const custom = emoji.match(/^[^:]+:(\d+)$/)
  return custom ? <img className="size-3.5" src={'https://cdn.discordapp.com/emojis/' + custom[1] + '.webp?size=32'} alt={emoji.split(':')[0]} /> : emoji
}

function renderAttachment(attachment: Message['attachments'][number]) {
  const image = attachment.contentType?.startsWith('image/')
    || attachment.id.startsWith('image:')
    || hasImageExtension(attachment.url)
  if (image) {
    return <a className="mt-1 block w-fit max-w-full" href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}>
      <img className="max-h-56 max-w-full rounded-lg border border-stone-200 object-contain" src={attachment.url} alt={attachment.name} />
      <span className="mt-0.5 flex items-center gap-1 text-[8px] text-stone-400">{attachment.name}<ExternalLink size={8} /></span>
    </a>
  }
  return <a className="mr-1 inline-flex items-center gap-1 text-[9px] text-emerald-800 underline" href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}>{attachment.name}<ExternalLink size={9} /></a>
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

function focusMessageWhenVisible(id: string, attempts = 8, onVisible?: () => void, _behavior: ScrollBehavior = 'smooth') {
  const element = document.getElementById('discord-message-' + id)
  if (!element) {
    if (attempts > 0) setTimeout(() => focusMessageWhenVisible(id, attempts - 1, onVisible, _behavior), 60)
    else onVisible?.()
    return
  }
  document.querySelectorAll('.deep-link-selected').forEach((current) => current.classList.remove('deep-link-selected'))
  element.classList.add('deep-link-selected')
  onVisible?.()
}
