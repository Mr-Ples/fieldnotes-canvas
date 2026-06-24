import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Files, GripVertical, MessageSquare, MessageSquareText, MessagesSquare } from 'lucide-react'

export type DockTabId = 'canvases' | 'chat' | 'discord' | 'annotations'
export type DockLocation = 'left' | 'right' | 'margin'

const labels: Record<DockTabId, string> = { canvases: 'Canvases', chat: 'Chat', discord: 'Discord', annotations: 'Annotations' }

function TabIcon({ id }: { id: DockTabId }) {
  return id === 'canvases' ? <Files size={15}/> : id === 'chat' ? <MessageSquare size={15}/> : id === 'discord' ? <MessagesSquare size={15}/> : <MessageSquareText size={15}/>
}

export function DockTabs({ tabs, active, location, annotationCount, draggingTab, onDragChange, onActivate, onDropTab }: { tabs: DockTabId[]; active: DockTabId | null; location: DockLocation; annotationCount: number; draggingTab: DockTabId | null; onDragChange: (tab: DockTabId | null) => void; onActivate: (tab: DockTabId) => void; onDropTab: (tab: DockTabId, location: DockLocation, index: number) => void }) {
  const tabsRef = useRef<HTMLDivElement>(null)
  const [dropTarget, setDropTarget] = useState<{ index: number; x: number } | null>(null)
  const drop = (event: DragEvent, index: number) => {
    event.preventDefault()
    const id = event.dataTransfer.getData('application/x-fieldnotes-tab') as DockTabId
    onDragChange(null)
    if (id) onDropTab(id, location, index)
    setDropTarget(null)
  }
  const targetAt = (index: number, x: number) => {
    const container = tabsRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    setDropTarget({ index, x: x - containerRect.left + container.scrollLeft })
  }
  const targetFromPointer = (clientX: number) => {
    const buttons = Array.from(tabsRef.current?.querySelectorAll<HTMLElement>('.dock-tab') ?? [])
    const before = buttons.findIndex((button) => { const rect = button.getBoundingClientRect(); return clientX < rect.left + rect.width / 2 })
    if (before >= 0) targetAt(before, buttons[before].getBoundingClientRect().left)
    else targetAt(buttons.length, buttons.at(-1)?.getBoundingClientRect().right ?? clientX)
  }
  return <div ref={tabsRef} className="panel-tabs dock-tabs" role="tablist" onDragOver={(event) => { if (!draggingTab) return; event.preventDefault(); targetFromPointer(event.clientX) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null) }} onDrop={(event) => drop(event, dropTarget?.index ?? tabs.length)}>
    {tabs.map((id, index) => <button key={id} role="tab" aria-selected={active === id} className={`tab-button dock-tab ${active === id ? 'is-active' : ''}`} draggable onDragStart={(event) => { onDragChange(id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-fieldnotes-tab', id) }} onDragEnd={() => { onDragChange(null); setDropTarget(null) }} onDragOver={(event) => { if (!draggingTab) return; event.preventDefault(); targetFromPointer(event.clientX) }} onDrop={(event) => { event.stopPropagation(); drop(event, dropTarget?.index ?? index) }} onClick={() => onActivate(id)}>
      <GripVertical className="dock-grip" size={12}/><TabIcon id={id}/>{labels[id]}{id === 'annotations' && annotationCount > 0 && <span className="count">{annotationCount}</span>}
    </button>)}
    {dropTarget && <i className="dock-drop-marker" style={{ left: dropTarget.x }} aria-hidden="true"/>}
  </div>
}

export function DockDropEdge({ location, draggingTab, onDragChange, onDropTab }: { location: 'left' | 'right'; draggingTab: DockTabId | null; onDragChange: (tab: DockTabId | null) => void; onDropTab: (tab: DockTabId, location: DockLocation, index: number) => void }) {
  return <div className={`dock-drop-edge dock-drop-${location}`} aria-label={`Drop a tab in the ${location} panel`} onDragOver={(event) => { if (!draggingTab) return; event.preventDefault(); event.currentTarget.classList.add('is-over') }} onDragLeave={(event) => event.currentTarget.classList.remove('is-over')} onDrop={(event) => { if (!draggingTab) return; event.preventDefault(); event.currentTarget.classList.remove('is-over'); const id = event.dataTransfer.getData('application/x-fieldnotes-tab') as DockTabId; onDragChange(null); if (id) onDropTab(id, location, 0) }}/>
}

export function DockView({ show, children }: { show: boolean; children: ReactNode }) {
  return <div className={`dock-view ${show ? 'is-active' : ''}`}>{children}</div>
}
