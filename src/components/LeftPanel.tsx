import { useState } from 'react'
import { Archive, Bot, ChevronDown, FileText, FolderOpen, MessageSquare, MoreHorizontal, Plus, Search, Send, Sparkles } from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'
import { canvases } from '../data'
import { IconButton, TabButton } from './Primitives'

export default function LeftPanel() {
  const [tab, setTab] = useState<'canvases' | 'chat'>('canvases')
  const [query, setQuery] = useState('')
  const filtered = canvases.filter((canvas) => canvas.title.toLowerCase().includes(query.toLowerCase()))

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
      <button className="new-canvas"><span><Plus size={17} /> New canvas</span><span className="new-canvas-shortcut">N</span></button>
      <div className="canvas-list" aria-label="Canvas directory">
        <Virtuoso data={filtered} itemContent={(_, canvas) => <div className="canvas-group-wrap">
          {(filtered.findIndex((item) => item.group === canvas.group) === filtered.indexOf(canvas)) && <div className="group-label"><span>{canvas.group}</span><ChevronDown size={14} /></div>}
          <a href={`#canvas-${canvas.id}`} className={`canvas-item ${canvas.id === 'attention' ? 'is-current' : ''}`}>
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
  return <div className="chat-panel">
    <div className="chat-heading"><div><span className="eyebrow">Current chat</span><h3>Attention as a material</h3></div><IconButton label="New chat"><Plus size={18} /></IconButton></div>
    <div className="model-pill"><Bot size={14} /> Claude 3.5 Sonnet <ChevronDown size={13} /></div>
    <div className="messages">
      <div className="message message-user">What does it mean to treat attention as a design material?</div>
      <div className="message message-ai"><Sparkles size={15} /><div>It means designing not only what a person sees, but the rhythm of their focus: when the interface asks, waits, recedes, or returns something to awareness.<button className="save-snippet"><FileText size={13} /> Save as resource</button></div></div>
      <div className="message message-user">Connect that to calm technology.</div>
      <div className="message message-ai"><Sparkles size={15} /><div>Calm technology argues that information should move fluidly between the center and periphery of attention. The interface becomes an environment rather than a sequence of demands.<button className="save-snippet"><FileText size={13} /> Save as resource</button></div></div>
    </div>
    <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); setMessage('') }}>
      <textarea aria-label="Chat message" placeholder="Ask about this canvas…" value={message} onChange={(event) => setMessage(event.target.value)} />
      <div><span>Uses canvas context</span><button aria-label="Send message" disabled={!message.trim()}><Send size={15} /></button></div>
    </form>
  </div>
}
