import { useEffect, useState } from 'react'
import { Files, MessageSquare, NotebookPen, PanelLeftClose, PanelRightClose } from 'lucide-react'
import CenterPanel from './components/CenterPanel'
import LeftPanel from './components/LeftPanel'
import RightPanel from './components/RightPanel'

type MobilePanel = 'left' | 'center' | 'right'

export default function App() {
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(() => new URL(window.location.href).searchParams.has('discordConnect') ? 'right' : 'center')
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash
      if (hash.startsWith('#annotation-comment')) setMobilePanel('right')
      else if (hash.startsWith('#chat-')) setMobilePanel('left')
      else if (hash.startsWith('#res-') || hash.startsWith('#comment-')) setMobilePanel('center')
    }
    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    const center = document.querySelector<HTMLElement>('.center-panel')
    const annotations = document.querySelector<HTMLElement>('.annotations')
    if (!center || !annotations) return
    let frame = 0
    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const centerRange = center.scrollHeight - center.clientHeight
        const annotationRange = annotations.scrollHeight - annotations.clientHeight
        if (centerRange > 0 && annotationRange > 0) annotations.scrollTop = (center.scrollTop / centerRange) * annotationRange
      })
    }
    center.addEventListener('scroll', sync, { passive: true })
    return () => { center.removeEventListener('scroll', sync); cancelAnimationFrame(frame) }
  }, [mobilePanel])
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

  return <div className={`app-shell ${leftOpen ? '' : 'left-collapsed'} ${rightOpen ? '' : 'right-collapsed'}`} data-mobile-panel={mobilePanel}>
    <LeftPanel />
    <button className="desktop-panel-toggle left-toggle" onClick={() => setLeftOpen(!leftOpen)} aria-label="Toggle left panel"><PanelLeftClose size={16}/></button>
    <CenterPanel />
    <button className="desktop-panel-toggle right-toggle" onClick={() => setRightOpen(!rightOpen)} aria-label="Toggle right panel"><PanelRightClose size={16}/></button>
    <RightPanel />
    <nav className="mobile-nav" aria-label="Canvas areas">
      <button className={mobilePanel === 'left' ? 'active' : ''} onClick={() => setMobilePanel('left')}><Files size={19}/><span>Canvases</span></button>
      <button className={mobilePanel === 'center' ? 'active' : ''} onClick={() => setMobilePanel('center')}><NotebookPen size={19}/><span>Notes</span></button>
      <button className={mobilePanel === 'right' ? 'active' : ''} onClick={() => setMobilePanel('right')}><MessageSquare size={19}/><span>Comments</span><i>2</i></button>
    </nav>
  </div>
}
