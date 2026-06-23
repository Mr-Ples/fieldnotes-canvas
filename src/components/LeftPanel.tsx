import { useEffect, useState } from 'react'
import { Archive, Bot, ChevronDown, FileText, FolderOpen, MessageSquare, MoreHorizontal, Plus, Search, Send, Sparkles } from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'
import { canvases as seedCanvases } from '../data'
import { CopyLinkButton, IconButton, TabButton } from './Primitives'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { completeChat, type ChatMessage } from '../services/api'

export default function LeftPanel() {
  const [tab, setTab] = useState<'canvases' | 'chat'>(() => window.location.hash.startsWith('#chat-') ? 'chat' : 'canvases')
  const [query, setQuery] = useState('')
  const [canvases, setCanvases] = useLocalStorage('fieldnotes:canvases', seedCanvases)
  const [activeId, setActiveId] = useState(() => {
    const stored = localStorage.getItem('fieldnotes:active-canvas')
    return stored ? (JSON.parse(stored) as { id: string }).id : 'attention'
  })
  const filtered = canvases.filter((canvas) => canvas.title.toLowerCase().includes(query.toLowerCase()))
  const createCanvas = () => {
    const title = window.prompt('Canvas name')?.trim()
    if (!title) return
    const canvas = { id: crypto.randomUUID(), title, emoji: '◇', updated: 'Now', group: 'Active' }
    setCanvases([canvas, ...canvases])
    selectCanvas(canvas)
  }
  const selectCanvas = (canvas: typeof canvases[number]) => {
    setActiveId(canvas.id)
    localStorage.setItem('fieldnotes:active-canvas', JSON.stringify(canvas))
    window.dispatchEvent(new CustomEvent('fieldnotes:canvas-selected', { detail: canvas }))
  }
  useEffect(() => {
    const hash = () => { if (window.location.hash.startsWith('#chat-')) setTab('chat') }
    window.addEventListener('hashchange', hash)
    return () => window.removeEventListener('hashchange', hash)
  }, [])

  return <aside className="side-panel left-panel">
    <div className="brand-row">
      <a className="brand" href="#top"><span className="brand-mark">F</span><span>Fieldnotes</span></a>
      <IconButton label="Workspace options"><MoreHorizontal size={18} /></IconButton>
    </div>
    <div className="panel-tabs" role="tablist">
      <TabButton active={tab === 'canvases'} onClick={() => setTab('canvases')}><FolderOpen size={16} /> Canvases</TabButton>
      <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}><MessageSquare size={16} /> Chat</TabButton>
    </div>

    {tab === 'canvases' ? <>
      <div className="search-box"><Search size={16} /><input aria-label="Search canvases" placeholder="Search canvases" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></div>
      <button className="new-canvas" onClick={createCanvas}><span><Plus size={17} /> New canvas</span><span className="new-canvas-shortcut">N</span></button>
      <div className="canvas-list" aria-label="Canvas directory">
        <Virtuoso data={filtered} itemContent={(_, canvas) => <div className="canvas-group-wrap">
          {(filtered.findIndex((item) => item.group === canvas.group) === filtered.indexOf(canvas)) && <div className="group-label"><span>{canvas.group}</span><ChevronDown size={14} /></div>}
          <a href={`#canvas-${canvas.id}`} onClick={() => selectCanvas(canvas)} className={`canvas-item ${canvas.id === activeId ? 'is-current' : ''}`}>
            <span className="canvas-symbol">{canvas.emoji}</span><span className="canvas-name">{canvas.title}</span><time>{canvas.updated}</time>
          </a>
        </div>} />
      </div>
      <button className="archive-link"><Archive size={16} /> View archive <span>12</span></button>
    </> : <ChatPanel />}
  </aside>
}

function ChatPanel() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>('fieldnotes:chat', [
    { id: 'welcome-user', role: 'user', content: 'What does it mean to treat attention as a design material?' },
    { id: 'welcome-ai', role: 'assistant', content: 'It means designing not only what a person sees, but the rhythm of their focus: when the interface asks, waits, recedes, or returns something to awareness.' },
  ])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    const content = message.trim()
    if (!content || pending) return
    const next = [...messages, { id: crypto.randomUUID(), role: 'user' as const, content }]
    setMessages(next); setMessage(''); setPending(true); setError('')
    try {
      const response = await completeChat(next)
      setMessages([...next, { id: crypto.randomUUID(), role: 'assistant', content: response }])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chat failed') }
    finally { setPending(false) }
  }
  const saveSnippet = (item: ChatMessage) => {
    const stored = JSON.parse(localStorage.getItem('fieldnotes:resources') ?? '[]') as unknown[]
    localStorage.setItem('fieldnotes:resources', JSON.stringify([{ id: `res-${crypto.randomUUID()}`, kind: 'chat', title: item.content.slice(0, 64), meta: 'AI chat · Saved now', accent: '#b28a3d', content: item.content }, ...stored]))
    window.dispatchEvent(new CustomEvent('fieldnotes:resources-changed'))
  }
  return <div className="chat-panel">
    <div className="chat-heading"><div><span className="eyebrow">Current chat</span><h3>Attention as a material</h3></div><IconButton label="New chat" onClick={() => setMessages([])}><Plus size={18} /></IconButton></div>
    <div className="model-pill"><Bot size={14} /> OpenRouter Free Router <ChevronDown size={13} /></div>
    <div className="messages">
      {messages.map((item) => item.role === 'user'
        ? <div className="message message-user deep-link-target" id={`chat-${item.id}`} key={item.id}>{item.content}</div>
        : <div className="message message-ai deep-link-target" id={`chat-${item.id}`} key={item.id}><Sparkles size={15} /><div>{item.content}<div className="flex items-center gap-2"><button className="save-snippet" onClick={() => saveSnippet(item)}><FileText size={13} /> Save as resource</button><CopyLinkButton target={`chat-${item.id}`}/></div></div></div>)}
      {pending && <div className="message message-ai"><Sparkles size={15}/><div>Thinking…</div></div>}
      {error && <div role="alert" className="message text-red-700">{error}</div>}
    </div>
    <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <textarea aria-label="Chat message" placeholder="Ask about this canvas…" value={message} onChange={(event) => setMessage(event.target.value)} />
      <div><span>Uses canvas context</span><button aria-label="Send message" disabled={!message.trim() || pending}><Send size={15} /></button></div>
    </form>
  </div>
}
