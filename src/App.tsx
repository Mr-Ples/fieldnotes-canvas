import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Files, MessageSquare, NotebookPen, PanelLeftClose, PanelRightClose } from 'lucide-react'
import CenterPanel from './components/CenterPanel'
import LeftPanel from './components/LeftPanel'
import RightPanel from './components/RightPanel'
import { PopupHost } from './components/Popups'

type MobilePanel = 'left' | 'center' | 'right'

export default function App() {
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(() => new URL(window.location.href).searchParams.has('discordConnect') || window.location.hash.startsWith('#discord-message-') ? 'right' : 'center')
  const [leftOpen, setLeftOpen] = useState(() => storedPanelState('fieldnotes:left-panel-open', true))
  const [rightOpen, setRightOpen] = useState(() => storedPanelState('fieldnotes:right-panel-open', true))
  const [leftWidth, setLeftWidth] = useState(() => storedPanelWidth('fieldnotes:left-panel-width', 340))
  const [rightWidth, setRightWidth] = useState(() => storedPanelWidth('fieldnotes:right-panel-width', 360))

  const startResize = (side: 'left' | 'right', event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = side === 'left' ? leftWidth : rightWidth
    const move = (pointer: PointerEvent) => {
      const delta = pointer.clientX - startX
      const width = Math.max(280, Math.min(520, startWidth + (side === 'left' ? delta : -delta)))
      if (side === 'left') setLeftWidth(width)
      else setRightWidth(width)
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.classList.remove('resizing-panels')
    }
    document.body.classList.add('resizing-panels')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }

  useEffect(() => {
    const url = new URL(window.location.href)
    const session = url.searchParams.get('discordConnect')
    const canvasId = url.searchParams.get('canvas')
    const authSession = url.searchParams.get('discordAuth')
    if (!window.opener || (!authSession && (!session || !canvasId))) return
    window.opener.postMessage(authSession
      ? { type: 'fieldnotes:discord-auth-complete' }
      : { type: 'fieldnotes:discord-oauth-complete', session, canvasId }, window.location.origin)
    window.close()
  }, [])
  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash
      if (hash.startsWith('#annotation-comment')) setMobilePanel('center')
      else if (hash.startsWith('#chat-')) setMobilePanel('left')
      else if (hash.startsWith('#res-') || hash.startsWith('#comment-')) setMobilePanel('center')
    }
    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    const token = new URL(window.location.href).searchParams.get('share')
    if (!token || sessionStorage.getItem(`fieldnotes:loaded-share:${token}`)) return
    void fetch(`/api/shares/${encodeURIComponent(token)}`).then(async (response) => {
      const result = await response.json() as { snapshot?: Record<string, string> }
      if (!response.ok || !result.snapshot) return
      Object.entries(result.snapshot).forEach(([key, value]) => localStorage.setItem(key, value))
      sessionStorage.setItem(`fieldnotes:loaded-share:${token}`, 'true')
      window.location.reload()
    })
  }, [])

  useEffect(() => { localStorage.setItem('fieldnotes:left-panel-width', String(leftWidth)) }, [leftWidth])
  useEffect(() => { localStorage.setItem('fieldnotes:right-panel-width', String(rightWidth)) }, [rightWidth])
  useEffect(() => { localStorage.setItem('fieldnotes:left-panel-open', String(leftOpen)) }, [leftOpen])
  useEffect(() => { localStorage.setItem('fieldnotes:right-panel-open', String(rightOpen)) }, [rightOpen])
  useEffect(() => { window.dispatchEvent(new CustomEvent('fieldnotes:panels-changed', { detail: { leftOpen, rightOpen } })) }, [leftOpen, rightOpen])

  const panelStyle = { '--left-panel-width': `${leftWidth}px`, '--right-panel-width': `${rightWidth}px` } as CSSProperties
  return <div className={`app-shell ${leftOpen ? '' : 'left-collapsed'} ${rightOpen ? '' : 'right-collapsed'}`} data-mobile-panel={mobilePanel} style={panelStyle}>
    <LeftPanel />
    <button className="desktop-panel-toggle left-toggle" onClick={() => setLeftOpen(!leftOpen)} aria-label="Toggle left panel"><PanelLeftClose size={16}/></button>
    {leftOpen && <div className="panel-resizer left-resizer" role="separator" aria-label="Resize left sidebar" aria-orientation="vertical" onPointerDown={(event) => startResize('left', event)}/>}
    <CenterPanel />
    <button className="desktop-panel-toggle right-toggle" onClick={() => setRightOpen(!rightOpen)} aria-label="Toggle right panel"><PanelRightClose size={16}/></button>
    {rightOpen && <div className="panel-resizer right-resizer" role="separator" aria-label="Resize right sidebar" aria-orientation="vertical" onPointerDown={(event) => startResize('right', event)}/>}
    <RightPanel />
    <nav className="mobile-nav" aria-label="Canvas areas">
      <button className={mobilePanel === 'left' ? 'active' : ''} onClick={() => setMobilePanel('left')}><Files size={19}/><span>Canvases</span></button>
      <button className={mobilePanel === 'center' ? 'active' : ''} onClick={() => setMobilePanel('center')}><NotebookPen size={19}/><span>Notes</span></button>
      <button className={mobilePanel === 'right' ? 'active' : ''} onClick={() => setMobilePanel('right')}><MessageSquare size={19}/><span>Discord</span></button>
    </nav>
    <PopupHost />
  </div>
}

function storedPanelWidth(key: string, fallback: number) {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) ? Math.max(280, Math.min(520, value)) : fallback
}

function storedPanelState(key: string, fallback: boolean) {
  const value = localStorage.getItem(key)
  return value === 'true' ? true : value === 'false' ? false : fallback
}
