import { useEffect, useState, type MouseEvent } from 'react'
import { Bot, ChevronDown, ChevronRight, FileText, Link2, PanelLeft, Plus, Search, Send, Settings, Sparkles } from 'lucide-react'
import { canvases as seedCanvases, projects as seedProjects, resources as seedResources, type Canvas } from '../data'
import { CopyLinkButton, IconButton } from './Primitives'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { completeChat, type ChatMessage } from '../services/api'
import { showPrompt, showToast } from './Popups'

export function CanvasPanel({ margin = false, onDock }: { margin?: boolean; onDock?: () => void }) {
  const [query, setQuery] = useState('')
  const [canvases, setCanvases] = useLocalStorage('fieldnotes:canvases', seedCanvases)
  const [projects] = useLocalStorage('fieldnotes:projects', seedProjects)
  const [collapsed, setCollapsed] = useLocalStorage<Record<string, boolean>>('fieldnotes:collapsed-projects', {})
  const [headings, setHeadings] = useState<{ id: string; title: string; level: number }[]>([])
  const [activeId, setActiveId] = useState(() => {
    const stored = localStorage.getItem('fieldnotes:active-canvas')
    return stored ? (JSON.parse(stored) as { id: string }).id : 'attention'
  })
  const normalized = canvases.map((canvas) => ({ ...canvas, projectId: canvas.projectId ?? (canvas.group === 'Active' ? 'attention-project' : canvas.group === 'Archive' ? 'fieldwork' : undefined) }))
  const filtered = normalized.filter((canvas) => canvas.title.toLowerCase().includes(query.toLowerCase()))
  const createCanvas = () => {
    void (async () => {
      const title = await showPrompt({ title: 'New canvas', message: 'Name this canvas.', placeholder: 'Canvas name', confirmLabel: 'Create' })
      if (!title) return
      const canvas: Canvas = { id: crypto.randomUUID(), title: title.trim(), emoji: '◇', updated: 'Now' }
      setCanvases([canvas, ...canvases])
      selectCanvas(canvas)
    })()
  }
  const selectCanvas = (canvas: typeof canvases[number]) => {
    setActiveId(canvas.id)
    localStorage.setItem('fieldnotes:active-canvas', JSON.stringify(canvas))
    window.dispatchEvent(new CustomEvent('fieldnotes:canvas-selected', { detail: canvas }))
  }
  useEffect(() => {
    if (!margin) return
    const read = () => setHeadings(Array.from(document.querySelectorAll<HTMLElement>('.note-editor h1, .note-editor h2, .note-editor h3')).map((heading, index) => {
      if (!heading.id) heading.id = `document-heading-${index}`
      return { id: heading.id, title: heading.textContent ?? '', level: Number(heading.tagName.slice(1)) }
    }))
    read()
    const observer = new MutationObserver(read)
    const editor = document.querySelector('.note-editor')
    if (editor) observer.observe(editor, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [activeId, margin])
  const projectAction = (projectId: string, kind: 'settings' | 'invite') => window.dispatchEvent(new CustomEvent('fieldnotes:open-permissions', { detail: { dialog: kind, scope: 'project', projectId } }))
  const canvasAction = (canvas: Canvas, kind: 'settings' | 'invite') => { selectCanvas(canvas); window.dispatchEvent(new CustomEvent('fieldnotes:open-permissions', { detail: { dialog: kind, scope: 'canvas', canvasId: canvas.id } })) }
  const scrollToHeading = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault()
    const target = document.getElementById(id)
    const scrollRoot = target?.closest<HTMLElement>('.app-shell')
    if (!target || !scrollRoot) return
    const stickyOffset = Number.parseFloat(getComputedStyle(scrollRoot).getPropertyValue('--canvas-scroll-offset')) || 160
    const top = target.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop - stickyOffset
    scrollRoot.scrollTo({ top, behavior: 'smooth' })
    window.history.replaceState(null, '', `#${id}`)
  }
  const canvasRow = (canvas: Canvas) => <div className="canvas-row" key={canvas.id}><a href={`#canvas-${canvas.id}`} onClick={() => selectCanvas(canvas)} className={`canvas-item ${canvas.id === activeId ? 'is-current' : ''}`}><span className="canvas-symbol">{canvas.emoji}</span><span className="canvas-name">{canvas.title}</span><time>{canvas.updated}</time></a><div className="directory-actions"><button title="Canvas permissions" aria-label={`${canvas.title} permissions`} onClick={() => canvasAction(canvas, 'settings')}><Settings size={12}/></button><button title="Copy canvas invite" aria-label={`Create invite for ${canvas.title}`} onClick={() => canvasAction(canvas, 'invite')}><Link2 size={12}/></button></div></div>

  return <div className={`canvas-directory ${margin ? 'is-margin' : ''}`}>
    <div className="search-box"><Search size={16} /><input aria-label="Search canvases" placeholder="Search canvases" value={query} onChange={(event) => setQuery(event.target.value)} />{margin ? <button className="margin-dock-button" type="button" onClick={onDock} aria-label="Dock Canvases in the left panel" title="Dock in left panel"><PanelLeft size={15}/></button> : <kbd>⌘ K</kbd>}</div>
    {!margin && <>
      <button className="new-canvas" onClick={createCanvas}><span><Plus size={17} /> New canvas</span><span className="new-canvas-shortcut">N</span></button>
    </>}
    <div className="canvas-list" aria-label="Canvas directory">
      {projects.map((project) => { const projectCanvases = filtered.filter((canvas) => canvas.projectId === project.id); if (!projectCanvases.length) return null; const closed = collapsed[project.id]; return <section className="canvas-project" key={project.id}><div className="group-label"><button className="project-toggle" onClick={() => setCollapsed({ ...collapsed, [project.id]: !closed })}>{closed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}<strong>{project.title}</strong></button><span className="directory-actions"><button aria-label={`${project.title} permissions`} title="Project permissions" onClick={() => projectAction(project.id, 'settings')}><Settings size={12}/></button><button aria-label={`Create invite for ${project.title}`} title="Copy project invite" onClick={() => projectAction(project.id, 'invite')}><Link2 size={12}/></button></span></div>{!closed && projectCanvases.map(canvasRow)}</section> })}
      {filtered.filter((canvas) => !canvas.projectId).map(canvasRow)}
      {margin && headings.length > 0 && <nav className="document-outline" aria-label="Canvas headings"><span>On this canvas</span>{headings.map((heading) => <a key={heading.id} className={`outline-level-${heading.level}`} href={`#${heading.id}`} onClick={(event) => scrollToHeading(event, heading.id)}>{heading.title}</a>)}</nav>}
    </div>
  </div>
}

export function ChatPanel() {
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
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
    }
  }
  const saveSnippet = (item: ChatMessage) => {
    const stored = JSON.parse(localStorage.getItem('fieldnotes:resources') ?? JSON.stringify(seedResources)) as unknown[]
    localStorage.setItem('fieldnotes:resources', JSON.stringify([{ id: `res-${crypto.randomUUID()}`, kind: 'chat', title: item.content.slice(0, 64), meta: 'AI chat · Saved now', accent: '#b28a3d', content: item.content }, ...stored]))
    window.dispatchEvent(new CustomEvent('fieldnotes:resources-changed'))
    showToast('Saved to resources')
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
      <textarea aria-label="Chat message" placeholder="Ask about this canvas…" value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={handleKeyDown} />
      <div><span>Uses canvas context</span><button aria-label="Send message" disabled={!message.trim() || pending}><Send size={15} /></button></div>
    </form>
  </div>
}
