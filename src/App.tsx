import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Files, MessageSquare, MessageSquareText, MessagesSquare, NotebookPen, PanelLeftClose, PanelRightClose } from 'lucide-react'
import CenterPanel from './components/CenterPanel'
import { CanvasPanel, ChatPanel } from './components/LeftPanel'
import { AnnotationsPanel, DiscordPanel } from './components/RightPanel'
import { DockDropEdge, DockTabs, DockView, type DockLocation, type DockTabId } from './components/DockPanel'
import { PopupHost } from './components/Popups'
import { deepLinkKind, deepLinkTarget } from './services/deepLinks'

type MobileView = 'notes' | DockTabId
type DockLayout = Record<DockLocation, DockTabId[]>
const defaultLayout: DockLayout = { left: ['canvases', 'chat'], right: ['discord', 'annotations'], margin: [] }
const MAX_PANEL_WIDTH = 520
const MAX_RIGHT_PANEL_WIDTH = 512

export default function App() {
  const [mobileView, setMobileView] = useState<MobileView>(() => new URL(window.location.href).searchParams.has('discordConnect') ? 'discord' : deepLinkKind() === 'discord-message' ? 'discord' : deepLinkKind() === 'annotation' ? 'annotations' : 'notes')
  const [layout, setLayout] = useState<DockLayout>(() => storedLayout())
  const [active, setActive] = useState<Record<DockLocation, DockTabId | null>>(() => ({ left: storedLayout().left[0] ?? null, right: storedLayout().right[0] ?? null, margin: storedLayout().margin[0] ?? null }))
  const [leftWidth, setLeftWidth] = useState(() => storedPanelWidth('fieldnotes:left-panel-width', 340))
  const [rightWidth, setRightWidth] = useState(() => storedPanelWidth('fieldnotes:right-panel-width', 360))
  const [leftExpanded, setLeftExpanded] = useState(() => storedPanelState('fieldnotes:left-panel-open', true))
  const [rightExpanded, setRightExpanded] = useState(() => storedPanelState('fieldnotes:right-panel-open', true))
  const [annotationCount, setAnnotationCount] = useState(0)
  const [draggingTab, setDraggingTab] = useState<DockTabId | null>(null)
  const mobileViewRef = useRef(mobileView)
  const lastBackExitPrompt = useRef(0)
  const leftOpen = layout.left.length > 0 && leftExpanded
  const rightOpen = layout.right.length > 0 && rightExpanded
  const marginOpen = !leftOpen && layout.margin.includes('canvases')
  const isMobile = () => window.matchMedia('(max-width: 820px)').matches

  const locationOfTab = (tab: DockTabId) => (Object.keys(layout) as DockLocation[]).find((location) => layout[location].includes(tab)) ?? 'left'
  const mobilePanelForView = (view: MobileView) => view === 'notes' ? 'center' : locationOfTab(view)

  const selectMobileView = (view: MobileView, historyMode: 'push' | 'replace' | 'none' = 'push') => {
    setMobileView(view)
    if (!isMobile() || historyMode === 'none') return
    const state = { ...(window.history.state ?? {}), fieldnotesMobileView: view }
    if (historyMode === 'replace') window.history.replaceState(state, '', window.location.href)
    else if (window.history.state?.fieldnotesMobileView !== view) window.history.pushState(state, '', window.location.href)
  }

  const selectMobileDockTab = (tab: DockTabId, historyMode: 'push' | 'replace' | 'none' = 'push') => {
    const location = locationOfTab(tab)
    setActiveTab(location, tab)
    if (location === 'left') setLeftExpanded(true)
    if (location === 'right') setRightExpanded(true)
    selectMobileView(tab, historyMode)
  }

  const moveTab = (tab: DockTabId, location: DockLocation, index: number) => {
    if (location === 'margin' && tab !== 'canvases') return
    setLayout((current) => {
      const sourceLocation = (Object.keys(current) as DockLocation[]).find((candidate) => current[candidate].includes(tab))
      const sourceIndex = sourceLocation ? current[sourceLocation].indexOf(tab) : -1
      const next = { left: current.left.filter((id) => id !== tab), right: current.right.filter((id) => id !== tab), margin: current.margin.filter((id) => id !== tab) }
      const adjustedIndex = sourceLocation === location && sourceIndex >= 0 && sourceIndex < index ? index - 1 : index
      next[location].splice(Math.max(0, Math.min(adjustedIndex, next[location].length)), 0, tab)
      return next
    })
    if (location === 'left') setLeftExpanded(true)
    if (location === 'right') setRightExpanded(true)
    setActive((current) => ({ ...current, [location]: tab }))
  }
  const setActiveTab = (location: DockLocation, tab: DockTabId) => setActive((current) => ({ ...current, [location]: tab }))

  const startResize = (side: 'left' | 'right', event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = side === 'left' ? leftWidth : rightWidth
    let moved = false
    const move = (pointer: PointerEvent) => {
      const delta = pointer.clientX - startX
      if (Math.abs(delta) > 3) moved = true
      const maxWidth = side === 'right' ? MAX_RIGHT_PANEL_WIDTH : MAX_PANEL_WIDTH
      const width = Math.max(280, Math.min(maxWidth, startWidth + (side === 'left' ? delta : -delta)))
      if (side === 'left') setLeftWidth(width); else setRightWidth(width)
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.classList.remove('resizing-panels')
      if (!moved) {
        if (side === 'left') setLeftExpanded(false)
        else setRightExpanded(false)
      }
    }
    document.body.classList.add('resizing-panels'); window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop, { once: true })
  }

  useEffect(() => {
    const url = new URL(window.location.href); const session = url.searchParams.get('discordConnect'); const canvasId = url.searchParams.get('canvas'); const authSession = url.searchParams.get('discordAuth')
    if (!window.opener || (!authSession && (!session || !canvasId))) return
    window.opener.postMessage(authSession ? { type: 'fieldnotes:discord-auth-complete' } : { type: 'fieldnotes:discord-oauth-complete', session, canvasId }, window.location.origin); window.close()
  }, [])
  useEffect(() => { mobileViewRef.current = mobileView }, [mobileView])
  useEffect(() => {
    if (!isMobile()) return
    if (!window.history.state?.fieldnotesMobileView) {
      const boundaryState = { ...(window.history.state ?? {}) }
      delete boundaryState.fieldnotesMobileView
      window.history.replaceState({ ...boundaryState, fieldnotesMobileBoundary: true }, '', window.location.href)
      window.history.pushState({ ...boundaryState, fieldnotesMobileView: mobileViewRef.current }, '', window.location.href)
    }
    const onPopState = () => {
      if (mobileViewRef.current !== 'notes') {
        lastBackExitPrompt.current = 0
        window.dispatchEvent(new Event('fieldnotes:open-notes-tab'))
        selectMobileView('notes', 'push')
        return
      }
      const centerBack = new Event('fieldnotes:center-back', { cancelable: true })
      if (!window.dispatchEvent(centerBack)) {
        lastBackExitPrompt.current = 0
        selectMobileView('notes', 'push')
        return
      }
      const now = Date.now()
      if (now - lastBackExitPrompt.current < 1800) {
        window.history.back()
        return
      }
      lastBackExitPrompt.current = now
      selectMobileView('notes', 'push')
      window.dispatchEvent(new CustomEvent('fieldnotes:popup-toast', { detail: { id: crypto.randomUUID(), title: 'Press back again to exit' } }))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  useEffect(() => {
    const onHash = () => {
      const kind = deepLinkKind(deepLinkTarget())
      if (kind === 'annotation') {
        selectMobileDockTab('annotations', 'push')
      } else if (kind === 'llm-chat') {
        selectMobileDockTab('chat', 'push')
      } else if (kind === 'discord-message') {
        selectMobileDockTab('discord', 'push')
      } else if (kind === 'resource' || kind === 'comment' || kind === 'canvas') selectMobileView('notes', 'push')
    }
    onHash(); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash)
  }, [layout])
  useEffect(() => {
    const availability = (event: Event) => setAnnotationCount((event as CustomEvent<{ count: number }>).detail.count)
    const openAnnotations = () => selectMobileDockTab('annotations', 'push')
    const showAnnotationInNotes = () => selectMobileView('notes', 'push')
    window.addEventListener('fieldnotes:annotations-docked', availability); window.addEventListener('fieldnotes:open-annotations', openAnnotations); window.addEventListener('fieldnotes:show-annotation-in-notes', showAnnotationInNotes)
    return () => { window.removeEventListener('fieldnotes:annotations-docked', availability); window.removeEventListener('fieldnotes:open-annotations', openAnnotations); window.removeEventListener('fieldnotes:show-annotation-in-notes', showAnnotationInNotes) }
  }, [layout])
  useEffect(() => { const token = new URL(window.location.href).searchParams.get('share'); if (!token || sessionStorage.getItem(`fieldnotes:loaded-share:${token}`)) return; void fetch(`/api/shares/${encodeURIComponent(token)}`).then(async (response) => { const result = await response.json() as { snapshot?: Record<string, string> }; if (!response.ok || !result.snapshot) return; Object.entries(result.snapshot).forEach(([key, value]) => localStorage.setItem(key, value)); sessionStorage.setItem(`fieldnotes:loaded-share:${token}`, 'true'); window.location.reload() }) }, [])
  useEffect(() => { localStorage.setItem('fieldnotes:dock-layout', JSON.stringify(layout)); setActive((current) => ({ left: layout.left.includes(current.left as DockTabId) ? current.left : layout.left[0] ?? null, right: layout.right.includes(current.right as DockTabId) ? current.right : layout.right[0] ?? null, margin: layout.margin.includes(current.margin as DockTabId) ? current.margin : layout.margin[0] ?? null })) }, [layout])
  useEffect(() => { localStorage.setItem('fieldnotes:left-panel-width', String(leftWidth)) }, [leftWidth]); useEffect(() => { localStorage.setItem('fieldnotes:right-panel-width', String(rightWidth)) }, [rightWidth])
  useEffect(() => { localStorage.setItem('fieldnotes:left-panel-open', String(leftExpanded)) }, [leftExpanded]); useEffect(() => { localStorage.setItem('fieldnotes:right-panel-open', String(rightExpanded)) }, [rightExpanded])
  useEffect(() => { window.dispatchEvent(new CustomEvent('fieldnotes:panels-changed', { detail: { leftOpen, rightOpen } })) }, [leftOpen, rightOpen])
  useEffect(() => {
    const location = layout.left.includes('annotations') ? 'left' : 'right'
    const panelVisible = window.matchMedia('(max-width: 820px)').matches ? mobileView === 'annotations' : location === 'left' ? leftOpen : rightOpen
    window.dispatchEvent(new CustomEvent('fieldnotes:annotations-tab-changed', { detail: { open: active[location] === 'annotations' && panelVisible } }))
  }, [active, layout, leftOpen, mobileView, rightOpen])

  const panelStyle = { '--left-panel-width': `${leftWidth}px`, '--right-panel-width': `${rightWidth}px`, '--effective-left-panel-width': leftOpen ? `${leftWidth}px` : '0px', '--effective-right-panel-width': rightOpen ? `${rightWidth}px` : '0px' } as CSSProperties
  const renderView = (tab: DockTabId, location: DockLocation) => tab === 'canvases' ? <CanvasPanel margin={location === 'margin'} onDock={location === 'margin' ? () => moveTab('canvases', 'left', layout.left.length) : undefined}/> : tab === 'chat' ? <ChatPanel/> : tab === 'discord' ? <DiscordPanel/> : <AnnotationsPanel/>
  const panel = (location: 'left' | 'right') => {
    const open = location === 'left' ? leftOpen : rightOpen
    const close = () => {
      if (isMobile()) {
        window.dispatchEvent(new Event('fieldnotes:open-notes-tab'))
        selectMobileView('notes', 'push')
      }
      else if (location === 'left') setLeftExpanded(false)
      else setRightExpanded(false)
    }
    return <aside className={`side-panel ${location}-panel`}><div className="side-panel-inner"><div className="panel-tab-row"><DockTabs tabs={layout[location]} active={active[location]} location={location} annotationCount={annotationCount} draggingTab={draggingTab} onDragChange={setDraggingTab} onActivate={(tab) => isMobile() ? selectMobileDockTab(tab, 'push') : setActiveTab(location, tab)} onDropTab={moveTab}/><button className="panel-close-button" onClick={close} aria-label={`Close ${location} panel`} title={`Close ${location} panel`}>{location === 'left' ? <PanelLeftClose size={16}/> : <PanelRightClose size={16}/>}</button></div>{layout[location].map((tab) => <DockView key={tab} show={active[location] === tab}>{renderView(tab, location)}</DockView>)}</div>{open && <div className={`panel-resizer ${location}-resizer`} role="separator" aria-label={`Resize or close ${location} sidebar`} aria-orientation="vertical" title={`Drag to resize or click to close ${location} sidebar`} onPointerDown={(event) => startResize(location, event)}/>}</aside>
  }

  return <div className={`app-shell ${leftOpen ? '' : 'left-collapsed'} ${rightOpen ? '' : 'right-collapsed'} ${marginOpen ? 'margin-open' : ''} ${draggingTab ? 'tab-dragging' : ''} ${draggingTab === 'canvases' ? 'tab-dragging-canvases' : ''}`} data-mobile-panel={mobilePanelForView(mobileView)} data-mobile-view={mobileView} style={panelStyle}>
    {panel('left')}
    {layout.left.length > 0 && !leftOpen && <button className="panel-edge-opener left-edge-opener" onClick={() => setLeftExpanded(true)} aria-label="Open left panel" title="Open left panel"/>}
    {!leftOpen && <DockDropEdge location="left" draggingTab={draggingTab} onDragChange={setDraggingTab} onDropTab={moveTab}/>} 
    <div className="margin-dock-drop" aria-label="Drop Canvases in the document margin" onDragOver={(event) => { if (draggingTab !== 'canvases') return; event.preventDefault(); event.currentTarget.classList.add('is-over') }} onDragLeave={(event) => event.currentTarget.classList.remove('is-over')} onDrop={(event) => { if (draggingTab !== 'canvases') return; event.preventDefault(); event.currentTarget.classList.remove('is-over'); const tab = event.dataTransfer.getData('application/x-fieldnotes-tab') as DockTabId; setDraggingTab(null); if (tab === 'canvases') moveTab(tab, 'margin', 0) }}><span>Canvases margin</span></div>
    <aside className="canvas-margin-dock">{layout.margin.map((tab) => <DockView key={tab} show={active.margin === tab}>{renderView(tab, 'margin')}</DockView>)}</aside>
    <CenterPanel/>
    {layout.right.length > 0 && !rightOpen && <button className="panel-edge-opener right-edge-opener" onClick={() => setRightExpanded(true)} aria-label="Open right panel" title="Open right panel"/>}
    {!rightOpen && <DockDropEdge location="right" draggingTab={draggingTab} onDragChange={setDraggingTab} onDropTab={moveTab}/>} {panel('right')}
    <nav className="mobile-nav" aria-label="Canvas areas"><button className={mobileView === 'canvases' ? 'active' : ''} onClick={() => selectMobileDockTab('canvases', 'push')}><Files size={19}/><span>Canvases</span></button><button className={mobileView === 'chat' ? 'active' : ''} onClick={() => selectMobileDockTab('chat', 'push')}><MessageSquare size={19}/><span>LLM chat</span></button><button className={mobileView === 'notes' ? 'active' : ''} onClick={() => { window.dispatchEvent(new Event('fieldnotes:open-notes-tab')); selectMobileView('notes', 'push') }}><NotebookPen size={19}/><span>Notes</span></button><button className={mobileView === 'annotations' ? 'active' : ''} onClick={() => selectMobileDockTab('annotations', 'push')}><MessageSquareText size={19}/><span>Annotations</span>{annotationCount > 0 && <i>{annotationCount}</i>}</button><button className={mobileView === 'discord' ? 'active' : ''} onClick={() => selectMobileDockTab('discord', 'push')}><MessagesSquare size={19}/><span>Discord</span></button></nav>
    <PopupHost/>
  </div>
}

function storedPanelWidth(key: string, fallback: number) { const value = Number(localStorage.getItem(key)); const maxWidth = key === 'fieldnotes:right-panel-width' ? MAX_RIGHT_PANEL_WIDTH : MAX_PANEL_WIDTH; return Number.isFinite(value) ? Math.max(280, Math.min(maxWidth, value)) : fallback }
function storedPanelState(key: string, fallback: boolean) { const value = localStorage.getItem(key); return value === 'true' ? true : value === 'false' ? false : fallback }
function storedLayout(): DockLayout { try { const value = JSON.parse(localStorage.getItem('fieldnotes:dock-layout') ?? '') as DockLayout; const all = [...value.left, ...value.right, ...value.margin]; return all.length === 4 && new Set(all).size === 4 ? value : defaultLayout } catch { return defaultLayout } }
