import { useLayoutEffect, useState } from 'react'
import { MessageSquare, MessageSquareText } from 'lucide-react'
import CanvasChat from './CanvasChat'
import { TabButton } from './Primitives'

export default function RightPanel() {
  const [tab, setTab] = useState<'chat' | 'annotations'>('chat')
  const [annotationCount, setAnnotationCount] = useState(0)

  useLayoutEffect(() => {
    const availability = (event: Event) => {
      const detail = (event as CustomEvent<{ docked: boolean; count: number }>).detail
      setAnnotationCount(detail.docked ? detail.count : 0)
      if (!detail.docked) setTab('chat')
    }
    const openAnnotations = (event: Event) => {
      setTab('annotations')
      const id = (event as CustomEvent<{ id?: string }>).detail?.id
      if (!id) return
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const list = document.querySelector<HTMLElement>('#right-panel-annotations .docked-annotations')
        const card = list?.querySelector<HTMLElement>(`[data-annotation-thread-id="${CSS.escape(id)}"]`)
        if (!list || !card) return
        const listRect = list.getBoundingClientRect()
        const cardRect = card.getBoundingClientRect()
        if (cardRect.top < listRect.top) list.scrollTop -= listRect.top - cardRect.top + 8
        else if (cardRect.bottom > listRect.bottom) list.scrollTop += cardRect.bottom - listRect.bottom + 8
      }))
    }
    window.addEventListener('fieldnotes:annotations-docked', availability)
    window.addEventListener('fieldnotes:open-annotations', openAnnotations)
    return () => {
      window.removeEventListener('fieldnotes:annotations-docked', availability)
      window.removeEventListener('fieldnotes:open-annotations', openAnnotations)
    }
  }, [])

  return <aside className="side-panel right-panel">
    <div className="panel-tabs" role="tablist">
      <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}><MessageSquare size={15}/> Discord</TabButton>
      {annotationCount > 0 && <TabButton active={tab === 'annotations'} onClick={() => setTab('annotations')}><MessageSquareText size={15}/> Annotations <span className="count">{annotationCount}</span></TabButton>}
    </div>
    <div className={`right-panel-view ${tab === 'chat' ? 'is-active' : ''}`}><CanvasChat /></div>
    <div className={`right-panel-view ${tab === 'annotations' ? 'is-active' : ''}`} id="right-panel-annotations" aria-label="Annotations" />
  </aside>
}
