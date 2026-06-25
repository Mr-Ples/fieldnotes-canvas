import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Bot, ChevronDown, ChevronRight, FileText, FolderPlus, Link2, MoreVertical, PanelLeft, Plus, Search, Send, Settings, Sparkles, Trash2 } from 'lucide-react'
import { canvases as seedCanvases, projects as seedProjects, resources as seedResources, type Canvas, type Project } from '../data'
import { CopyLinkButton, IconButton } from './Primitives'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { completeChat, type ChatMessage } from '../services/api'
import { showConfirm, showPrompt, showToast } from './Popups'
import { deepLinkKind, deepLinkTarget, navigateToDeepLink, scrollDeepLinkIntoView } from '../services/deepLinks'
import { canvasHeadings } from '../services/linkContent'

export function CanvasPanel({ margin = false, onDock }: { margin?: boolean; onDock?: () => void }) {
  const [query, setQuery] = useState('')
  const [canvases, setCanvases] = useLocalStorage('fieldnotes:canvases', seedCanvases)
  const [projects, setProjects] = useLocalStorage('fieldnotes:projects', seedProjects)
  const [collapsed, setCollapsed] = useLocalStorage<Record<string, boolean>>('fieldnotes:collapsed-projects', {})
  const [headings, setHeadings] = useState<{ id: string; title: string; level: number }[]>([])
  const [activeHeading, setActiveHeading] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [dragTarget, setDragTarget] = useState('')
  const touchCanvasDrag = useRef<{ canvasId: string; pointerId: number; started: boolean; timer: number; x: number; y: number } | null>(null)
  const suppressCanvasClick = useRef(false)
  const [activeId, setActiveId] = useState(() => {
    const stored = localStorage.getItem('fieldnotes:active-canvas')
    return stored ? (JSON.parse(stored) as { id: string }).id : 'attention'
  })
  const normalized = canvases.map((canvas) => ({ ...canvas, projectId: canvas.projectId ?? (canvas.group === 'Active' ? 'attention-project' : canvas.group === 'Archive' ? 'fieldwork' : undefined) }))
  const filtered = normalized.filter((canvas) => canvas.title.toLowerCase().includes(query.toLowerCase()))
  const activeCanvas = normalized.find((canvas) => canvas.id === activeId) ?? normalized[0]
  const syncCanvases = (next: Canvas[]) => {
    setCanvases(next)
    window.dispatchEvent(new CustomEvent('fieldnotes:canvases-changed', { detail: next }))
  }
  const syncProjects = (next: Project[]) => {
    setProjects(next)
    window.dispatchEvent(new CustomEvent('fieldnotes:projects-changed', { detail: next }))
  }
  const createCanvas = (projectId?: string) => {
    void (async () => {
      const title = await showPrompt({ title: 'New canvas', message: 'Name this canvas.', placeholder: 'Canvas name', confirmLabel: 'Create' })
      if (!title) return
      const canvas: Canvas = { id: crypto.randomUUID(), title: title.trim(), emoji: '◇', updated: 'Now', projectId }
      syncCanvases([canvas, ...canvases])
      selectCanvas(canvas)
      showToast('Canvas created')
    })()
  }
  const createProject = () => {
    void (async () => {
      const title = await showPrompt({ title: 'New project', message: 'Name the project. A first canvas will be created inside it.', placeholder: 'Project name', confirmLabel: 'Create project' })
      if (!title) return
      const project = { id: crypto.randomUUID(), title: title.trim() }
      const canvas: Canvas = { id: crypto.randomUUID(), title: 'Untitled canvas', emoji: '◇', updated: 'Now', projectId: project.id }
      syncProjects([project, ...projects])
      syncCanvases([canvas, ...canvases])
      selectCanvas(canvas)
      setCollapsed({ ...collapsed, [project.id]: false })
      showToast('Project created')
    })()
  }
  const selectCanvas = (canvas: typeof canvases[number]) => {
    setActiveId(canvas.id)
    localStorage.setItem('fieldnotes:active-canvas', JSON.stringify(canvas))
    window.dispatchEvent(new CustomEvent('fieldnotes:canvas-selected', { detail: canvas }))
  }
  useEffect(() => {
    const selected = (event: Event) => setActiveId((event as CustomEvent<Canvas>).detail.id)
    window.addEventListener('fieldnotes:canvas-selected', selected)
    return () => window.removeEventListener('fieldnotes:canvas-selected', selected)
  }, [])
  useEffect(() => {
    const changed = (event: Event) => {
      const next = (event as CustomEvent<Canvas[]>).detail
      if (Array.isArray(next)) setCanvases(next)
    }
    window.addEventListener('fieldnotes:canvases-changed', changed)
    return () => window.removeEventListener('fieldnotes:canvases-changed', changed)
  }, [setCanvases])
  useEffect(() => {
    const changed = (event: Event) => {
      const next = (event as CustomEvent<Project[]>).detail
      if (Array.isArray(next)) setProjects(next)
    }
    window.addEventListener('fieldnotes:projects-changed', changed)
    return () => window.removeEventListener('fieldnotes:projects-changed', changed)
  }, [setProjects])
  useEffect(() => {
    if (!margin) return
    const read = () => setHeadings(canvasHeadings(activeId))
    read()
    const observer = new MutationObserver(read)
    const editor = document.querySelector('.note-editor')
    if (editor) observer.observe(editor, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [activeId, margin])
  useEffect(() => {
    if (!margin || !headings.length) return
    const scrollRoot = document.querySelector<HTMLElement>('.app-shell')
    const update = () => {
      const offset = Number.parseFloat(getComputedStyle(scrollRoot ?? document.documentElement).getPropertyValue('--canvas-scroll-offset')) || 160
      const threshold = (scrollRoot?.getBoundingClientRect().top ?? 0) + offset + 96
      const current = headings.reduce((candidate, heading) => {
        const element = document.getElementById(heading.id)
        if (!element) return candidate
        return element.getBoundingClientRect().top <= threshold ? heading.id : candidate
      }, headings[0]?.id ?? '')
      setActiveHeading(current)
    }
    update()
    scrollRoot?.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { scrollRoot?.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [headings, margin])
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest('.directory-menu')) setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [])
  const projectAction = (projectId: string, kind: 'settings' | 'invite') => window.dispatchEvent(new CustomEvent('fieldnotes:open-permissions', { detail: { dialog: kind, scope: 'project', projectId } }))
  const canvasAction = (canvas: Canvas, kind: 'settings' | 'invite') => { selectCanvas(canvas); window.dispatchEvent(new CustomEvent('fieldnotes:open-permissions', { detail: { dialog: kind, scope: 'canvas', canvasId: canvas.id } })) }
  const deleteCanvas = (canvas: Canvas) => {
    void (async () => {
      if (!await showConfirm({ title: 'Delete canvas?', message: `Delete “${canvas.title}”? This removes it from your local canvas list.`, confirmLabel: 'Delete canvas', cancelLabel: 'Keep canvas', tone: 'danger' })) return
      const next = canvases.filter((item) => item.id !== canvas.id)
      syncCanvases(next)
      setMenu(null)
      if (canvas.id === activeId && next[0]) selectCanvas(next[0])
      showToast('Canvas deleted')
    })()
  }
  const deleteProject = (projectId: string) => {
    void (async () => {
      const project = projects.find((item) => item.id === projectId)
      const projectCanvases = normalized.filter((canvas) => canvas.projectId === projectId)
      if (!project) return
      if (!await showConfirm({ title: 'Delete project?', message: `Delete “${project.title}” and ${projectCanvases.length} canvas${projectCanvases.length === 1 ? '' : 'es'}?`, confirmLabel: 'Delete project', cancelLabel: 'Keep project', tone: 'danger' })) return
      const nextCanvases = canvases.filter((canvas) => (canvas.projectId ?? (canvas.group === 'Active' ? 'attention-project' : canvas.group === 'Archive' ? 'fieldwork' : undefined)) !== projectId)
      syncProjects(projects.filter((item) => item.id !== projectId))
      syncCanvases(nextCanvases)
      setMenu(null)
      if (projectCanvases.some((canvas) => canvas.id === activeId) && nextCanvases[0]) selectCanvas(nextCanvases[0])
      showToast('Project deleted')
    })()
  }
  const renameProject = (projectId: string) => {
    void (async () => {
      const project = projects.find((item) => item.id === projectId)
      if (!project) return
      const title = await showPrompt({ title: 'Rename project', message: 'Update this project name.', placeholder: 'Project name', confirmLabel: 'Rename', defaultValue: project.title })
      if (!title?.trim()) return
      syncProjects(projects.map((item) => item.id === projectId ? { ...item, title: title.trim() } : item))
      setMenu(null)
      showToast('Project renamed')
    })()
  }
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
  const dragCanvas = (event: DragEvent<HTMLElement>, canvas: Canvas) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-fieldnotes-canvas', canvas.id)
  }
  const moveCanvas = (canvasId: string, projectId?: string) => {
    const stored = JSON.parse(localStorage.getItem('fieldnotes:canvases') ?? JSON.stringify(canvases)) as Canvas[]
    const next = stored.map((canvas) => canvas.id === canvasId ? { ...canvas, projectId, group: undefined } : canvas)
    const moved = next.find((canvas) => canvas.id === canvasId)
    syncCanvases(next)
    if (moved?.id === activeId) localStorage.setItem('fieldnotes:active-canvas', JSON.stringify(moved))
    showToast(projectId ? 'Moved to project' : 'Moved to standalone')
  }
  const allowCanvasDrop = (event: DragEvent<HTMLElement>, target: string) => {
    if (!Array.from(event.dataTransfer.types).includes('application/x-fieldnotes-canvas')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dragTarget !== target) setDragTarget(target)
  }
  const leaveCanvasDrop = (event: DragEvent<HTMLElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    setDragTarget('')
  }
  const dropCanvas = (event: DragEvent<HTMLElement>, projectId?: string) => {
    const canvasId = event.dataTransfer.getData('application/x-fieldnotes-canvas')
    setDragTarget('')
    if (!canvasId) return
    event.preventDefault()
    moveCanvas(canvasId, projectId)
  }
  const startTouchCanvasDrag = (event: ReactPointerEvent<HTMLDivElement>, canvas: Canvas) => {
    if (event.pointerType === 'mouse' || (event.target as Element).closest('.directory-actions, .directory-menu')) return
    const target = event.currentTarget
    touchCanvasDrag.current = {
      canvasId: canvas.id,
      pointerId: event.pointerId,
      started: false,
      x: event.clientX,
      y: event.clientY,
      timer: window.setTimeout(() => {
        const drag = touchCanvasDrag.current
        if (!drag || drag.pointerId !== event.pointerId) return
        drag.started = true
        target.setPointerCapture(event.pointerId)
        setDragTarget('')
      }, 320),
    }
  }
  const moveTouchCanvasDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = touchCanvasDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.started && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 10) {
      window.clearTimeout(drag.timer)
      touchCanvasDrag.current = null
      return
    }
    if (!drag.started) return
    event.preventDefault()
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-canvas-drop-target]')
    setDragTarget(target?.dataset.canvasDropTarget ?? '')
  }
  const finishTouchCanvasDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = touchCanvasDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    window.clearTimeout(drag.timer)
    if (drag.started) {
      event.preventDefault()
      suppressCanvasClick.current = true
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-canvas-drop-target]')
      const dropId = target?.dataset.canvasDropTarget ?? ''
      if (dropId) moveCanvas(drag.canvasId, dropId.startsWith('project-') ? dropId.replace(/^project-/, '') : undefined)
    }
    setDragTarget('')
    touchCanvasDrag.current = null
  }
  const ActionMenu = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => <div className="directory-menu"><button className="directory-menu-trigger" aria-label={label} aria-expanded={menu === id} onClick={(event) => { event.stopPropagation(); setMenu(menu === id ? null : id) }}><MoreVertical size={14}/></button>{menu === id && <div className="directory-menu-popover" role="menu" onClick={() => setMenu(null)}>{children}</div>}</div>
  const canvasRow = (canvas: Canvas) => <div className="canvas-row deep-link-target" id={`canvas-${canvas.id}`} key={canvas.id} draggable onContextMenu={(event) => { if (window.matchMedia('(max-width: 820px)').matches) event.preventDefault() }} onPointerDown={(event) => startTouchCanvasDrag(event, canvas)} onPointerMove={moveTouchCanvasDrag} onPointerUp={finishTouchCanvasDrag} onPointerCancel={finishTouchCanvasDrag} onDragStart={(event) => dragCanvas(event, canvas)} onDragEnd={() => setDragTarget('')}><a href={`#canvas-${canvas.id}`} onClick={(event) => { event.preventDefault(); if (suppressCanvasClick.current) { suppressCanvasClick.current = false; return } selectCanvas(canvas); navigateToDeepLink(`canvas-${canvas.id}`) }} className={`canvas-item ${canvas.id === activeId ? 'is-current' : ''}`}><span className="canvas-symbol">{canvas.emoji}</span><span className="canvas-name">{canvas.title}</span><time>{canvas.updated}</time></a><div className="directory-actions"><ActionMenu id={`canvas-${canvas.id}`} label={`${canvas.title} options`}><CopyLinkButton target={`canvas-${canvas.id}`}/><button role="menuitem" onClick={() => canvasAction(canvas, 'invite')}><Link2 size={13}/> Create invite link</button><button role="menuitem" onClick={() => canvasAction(canvas, 'settings')}><Settings size={13}/> Permissions</button><button role="menuitem" className="danger" onClick={() => deleteCanvas(canvas)}><Trash2 size={13}/> Delete canvas</button></ActionMenu></div></div>
  const standaloneCanvases = filtered.filter((canvas) => !canvas.projectId)

  return <div className={`canvas-directory ${margin ? 'is-margin' : ''}`}>
    <div className="search-box"><Search size={16} /><input aria-label="Search canvases" placeholder="Search canvases" value={query} onChange={(event) => setQuery(event.target.value)} />{margin ? <><button className="margin-dock-button" type="button" onClick={onDock} aria-label="Dock in left panel" title="Dock in left panel"><PanelLeft size={14}/></button><ActionMenu id="margin-actions" label="Canvas margin options"><button role="menuitem" onClick={() => createCanvas()}><Plus size={13}/> New canvas</button><button role="menuitem" onClick={createProject}><FolderPlus size={13}/> New project</button></ActionMenu></> : <kbd>⌘ K</kbd>}</div>
    {!margin && <div className="directory-create-row">
      <button className="new-canvas" onClick={() => createCanvas()}><span><Plus size={17} /> New canvas</span><span className="new-canvas-shortcut">N</span></button>
      <button className="new-project" onClick={createProject} aria-label="New project" title="New project"><FolderPlus size={16}/></button>
    </div>}
    <div className="canvas-list" aria-label="Canvas directory">
      {projects.map((project) => { const projectCanvases = filtered.filter((canvas) => canvas.projectId === project.id); if (!projectCanvases.length && query) return null; const closed = collapsed[project.id]; const dropId = `project-${project.id}`; return <section data-canvas-drop-target={dropId} className={`canvas-project ${dragTarget === dropId ? 'is-drop-target' : ''}`} key={project.id} onDragOver={(event) => allowCanvasDrop(event, dropId)} onDragLeave={leaveCanvasDrop} onDrop={(event) => dropCanvas(event, project.id)}><div className="group-label"><button className="project-toggle" onClick={() => setCollapsed({ ...collapsed, [project.id]: !closed })}>{closed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}<strong>{project.title}</strong></button><span className="directory-actions"><ActionMenu id={`project-${project.id}`} label={`${project.title} options`}><button role="menuitem" onClick={() => createCanvas(project.id)}><Plus size={13}/> New canvas</button><button role="menuitem" onClick={() => renameProject(project.id)}><FileText size={13}/> Rename project</button><button role="menuitem" onClick={() => projectAction(project.id, 'invite')}><Link2 size={13}/> Create invite link</button><button role="menuitem" onClick={() => projectAction(project.id, 'settings')}><Settings size={13}/> Permissions</button><button role="menuitem" className="danger" onClick={() => deleteProject(project.id)}><Trash2 size={13}/> Delete project</button></ActionMenu></span></div>{!closed && projectCanvases.map(canvasRow)}</section> })}
      <section data-canvas-drop-target="standalone" className={`canvas-standalone ${dragTarget === 'standalone' ? 'is-drop-target' : ''}`} onDragOver={(event) => allowCanvasDrop(event, 'standalone')} onDragLeave={leaveCanvasDrop} onDrop={(event) => dropCanvas(event)}>{standaloneCanvases.map(canvasRow)}</section>
      {margin && headings.length > 0 && <nav className="document-outline" aria-label="Canvas headings"><span>{activeCanvas?.title ?? 'Canvas'}</span>{headings.map((heading) => <a key={heading.id} className={`outline-level-${heading.level} ${activeHeading === heading.id ? 'is-active' : ''}`} href={`#${heading.id}`} onClick={(event) => scrollToHeading(event, heading.id)}>{heading.title}</a>)}</nav>}
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
  useEffect(() => {
    const reveal = () => {
      const target = deepLinkTarget()
      if (deepLinkKind(target) === 'llm-chat') scrollDeepLinkIntoView(target)
    }
    reveal()
    window.addEventListener('hashchange', reveal)
    return () => window.removeEventListener('hashchange', reveal)
  }, [messages.length])
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
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
        ? <div className="message message-user deep-link-target group" id={`chat-${item.id}`} key={item.id}>{item.content}<div className="mt-1 hidden justify-end group-hover:flex group-focus-within:flex"><CopyLinkButton target={`chat-${item.id}`}/></div></div>
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
