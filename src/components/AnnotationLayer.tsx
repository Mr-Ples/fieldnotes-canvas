import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Check, Link2, MessageSquareText, MoreHorizontal, Plus, Send, Trash2, X } from 'lucide-react'
import { Avatar } from './Primitives'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { showConfirm, showToast } from './Popups'

type Annotation = { id: string; anchorId?: string; quote: string; author: string; initials: string; time: string; body: string; replies?: string[] }
type Position = { id: string; top: number; compact: boolean }

const seedAnnotations: Annotation[] = [
  { id: 'annotation-comment-1', anchorId: 'annotation-1', quote: '“what kind of attention does this moment deserve?”', author: 'Mara Chen', initials: 'MC', time: '24m ago', body: 'This framing is strong. It moves the responsibility back to the designer, not the user.' },
  { id: 'annotation-comment-2', anchorId: 'annotation-2', quote: 'The return is as important as the capture.', author: 'Jon Bell', initials: 'JB', time: '1h ago', body: 'Could we connect this to the idea of “resumability” in tools for thought?' },
]

export default function AnnotationLayer({ editorRef, containerRef, canvasId, onDocumentChange }: { editorRef: RefObject<HTMLElement | null>; containerRef: RefObject<HTMLElement | null>; canvasId: string; onDocumentChange: () => void }) {
  const [items, setItems] = useLocalStorage<Annotation[]>('fieldnotes:annotations', seedAnnotations)
  const [selection, setSelection] = useState<{ range: Range; quote: string; rect: DOMRect } | null>(null)
  const [composing, setComposing] = useState(false)
  const [body, setBody] = useState('')
  const [reply, setReply] = useState<Record<string, string>>({})
  const [menu, setMenu] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const locate = useCallback(() => {
    const container = containerRef.current
    const editor = editorRef.current
    if (!editor || !container) return
    const containerRect = container.getBoundingClientRect()
    const editorRect = editor.getBoundingClientRect()
    const raw = items.flatMap((item) => {
      const anchors = Array.from(editor.querySelectorAll<HTMLElement>(`[data-annotation-id="${CSS.escape(item.id)}"]`))
      const anchorId = item.anchorId ?? legacyAnchorId(item.id)
      const fallback = anchorId ? document.getElementById(anchorId) : null
      const anchor = anchors[0] ?? fallback
      if (!anchor) return []
      if (!anchor.dataset.annotationId) anchor.dataset.annotationId = item.id
      anchor.classList.add('annotation-highlight')
      const rect = anchor.getBoundingClientRect()
      const anchorTop = rect.top - containerRect.top + container.scrollTop
      const top = Math.max(0, anchorTop - 12)
      const compact = containerRect.right - editorRect.right < 310
      return [{ id: item.id, top, compact }]
    }).sort((a, b) => a.top - b.top)
    let nextTop = 70
    setPositions(raw.map((position) => {
      const top = Math.max(position.top, nextTop)
      nextTop = top + 158
      return { ...position, top }
    }))
  }, [containerRef, editorRef, items])

  useLayoutEffect(() => { locate() }, [locate, canvasId])
  useEffect(() => {
    const container = containerRef.current
    const editor = editorRef.current
    if (!editor || !container) return
    const update = () => locate()
    window.addEventListener('resize', update)
    const observer = new ResizeObserver(update)
    observer.observe(container); observer.observe(editor)
    return () => { window.removeEventListener('resize', update); observer.disconnect() }
  }, [containerRef, editorRef, locate])

  useEffect(() => {
    const reveal = () => {
      const id = window.location.hash.slice(1)
      const item = items.find((candidate) => candidate.id === id)
      if (!item) return
      setActive(id)
      const anchorId = item.anchorId ?? legacyAnchorId(item.id)
      const anchor = editorRef.current?.querySelector<HTMLElement>(`[data-annotation-id="${CSS.escape(id)}"]`) ?? (anchorId ? document.getElementById(anchorId) : null)
      anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      requestAnimationFrame(locate)
    }
    reveal(); window.addEventListener('hashchange', reveal)
    return () => window.removeEventListener('hashchange', reveal)
  }, [editorRef, items, locate])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const updateSelection = () => {
      const selected = window.getSelection()
      if (!selected || selected.isCollapsed || !selected.rangeCount) { if (!composing) setSelection(null); return }
      const range = selected.getRangeAt(0)
      if (!editor.contains(range.commonAncestorContainer)) { if (!composing) setSelection(null); return }
      const quote = selected.toString().replace(/\s+/g, ' ').trim()
      if (!quote) return
      const rects = range.getClientRects()
      const rect = rects[rects.length - 1] ?? range.getBoundingClientRect()
      setSelection({ range: range.cloneRange(), quote, rect })
    }
    editor.ownerDocument?.addEventListener('selectionchange', updateSelection)
    return () => { editor.ownerDocument?.removeEventListener('selectionchange', updateSelection) }
  }, [editorRef, composing])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const over = (event: Event) => setActive((event.target as Element).closest<HTMLElement>('[data-annotation-id]')?.dataset.annotationId ?? null)
    const click = (event: Event) => {
      const id = (event.target as Element).closest<HTMLElement>('[data-annotation-id]')?.dataset.annotationId
      if (id) { setActive(id); window.location.hash = id }
    }
    editor.addEventListener('mouseover', over); editor.addEventListener('focusin', over); editor.addEventListener('click', click)
    return () => { editor.removeEventListener('mouseover', over); editor.removeEventListener('focusin', over); editor.removeEventListener('click', click) }
  }, [editorRef])

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target) return
      if (target.closest('.annotation-menu')) return
      setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [containerRef])

  const openComposer = () => { setComposing(true); requestAnimationFrame(() => composerRef.current?.focus()) }
  const closeComposer = () => { setComposing(false); setBody(''); setSelection(null); window.getSelection()?.removeAllRanges() }
  const create = () => {
    if (!selection || !body.trim()) return
    const id = `annotation-comment-${crypto.randomUUID()}`
    highlightRange(selection.range, id)
    setItems([...items, { id, quote: selection.quote, author: 'You', initials: 'YO', time: 'Now', body: body.trim() }])
    onDocumentChange(); closeComposer(); setActive(id); window.location.hash = id
    requestAnimationFrame(locate)
  }
  const addReply = (id: string) => {
    const value = reply[id]?.trim()
    if (!value) return
    setItems(items.map((item) => item.id === id ? { ...item, replies: [...(item.replies ?? []), value] } : item))
    setReply((current) => ({ ...current, [id]: '' }))
  }
  const copyLink = async (id: string) => {
    const url = new URL(window.location.href); url.hash = id
    await navigator.clipboard.writeText(url.toString())
    setMenu(null)
    showToast('Link copied')
  }
  const remove = (id: string) => {
    void (async () => {
      if (!await showConfirm({
        title: 'Delete annotation thread?',
        message: 'This removes the thread from the document.',
        confirmLabel: 'Delete thread',
        cancelLabel: 'Keep thread',
        tone: 'danger',
      })) return
      const editor = editorRef.current
      editor?.querySelectorAll<HTMLElement>(`[data-annotation-id="${CSS.escape(id)}"]`).forEach((anchor) => {
        if (anchor.tagName === 'MARK') anchor.replaceWith(...Array.from(anchor.childNodes))
        else { delete anchor.dataset.annotationId; anchor.classList.remove('annotation-highlight') }
      })
      editor?.normalize()
      setItems(items.filter((item) => item.id !== id))
      setActive(null); setMenu(null); onDocumentChange()
      showToast('Annotation deleted')
    })()
  }

  const root = containerRef.current
  if (!root) return null
  const rootRect = root.getBoundingClientRect()
  const trackLeft = Math.max(16, Math.min(root.clientWidth - 308, editorRef.current ? editorRef.current.getBoundingClientRect().right - rootRect.left + 18 : root.clientWidth - 308))
  return createPortal(<div className="annotation-ui" aria-live="polite">
    {selection && !composing && <button className="annotation-add" style={{ top: selection.rect.top - rootRect.top + root.scrollTop + selection.rect.height / 2, left: trackLeft }} onMouseDown={(event) => event.preventDefault()} onClick={openComposer} aria-label="Add annotation to selection"><Plus size={14}/> Add annotation</button>}
    {selection && composing && <div className="annotation-composer" style={{ top: Math.min(selection.rect.bottom - rootRect.top + root.scrollTop + 8, root.scrollTop + root.clientHeight - 210), left: trackLeft }}>
      <div className="annotation-composer-head"><span><MessageSquareText size={14}/> New annotation</span><button onClick={closeComposer} aria-label="Cancel annotation"><X size={15}/></button></div>
      <blockquote>“{selection.quote}”</blockquote>
      <textarea ref={composerRef} value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') create() }} placeholder="Add a comment…" aria-label="Annotation comment"/>
      <div><span>⌘ Enter to send</span><button disabled={!body.trim()} onClick={create}><Check size={13}/> Comment</button></div>
    </div>}
    {positions.map((position) => {
      const item = items.find((candidate) => candidate.id === position.id)
      if (!item) return null
      const foreground = active === item.id || menu === item.id
      return <div className={`annotation-thread ${position.compact ? 'is-compact' : ''} ${foreground ? 'is-active' : ''}`} style={{ top: position.top, left: trackLeft }} key={item.id} onMouseEnter={() => setActive(item.id)} onMouseLeave={() => setActive(null)}>
        <article className="annotation-card" id={item.id}>
          <div className="annotation-meta"><Avatar initials={item.initials} color={item.author === 'You' ? 'ink' : 'sage'}/><div><strong>{item.author}</strong><time>{item.time}</time></div><div className="annotation-menu"><button aria-label="Annotation options" aria-expanded={menu === item.id} onClick={() => setMenu(menu === item.id ? null : item.id)}><MoreHorizontal size={16}/></button>{menu === item.id && <div role="menu"><button role="menuitem" onClick={() => void copyLink(item.id)}><Link2 size={13}/> Copy link</button><button role="menuitem" onClick={() => remove(item.id)}><Trash2 size={13}/> Delete thread</button></div>}</div></div>
          <p>{item.body}</p>
          {item.replies?.map((value, index) => <div className="annotation-reply" key={`${item.id}-${index}`}><Avatar initials="YO" color="ink"/><p><strong>You</strong>{value}</p></div>)}
          <div className="annotation-reply-box"><input value={reply[item.id] ?? ''} onChange={(event) => setReply((current) => ({ ...current, [item.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') addReply(item.id) }} placeholder="Reply…" aria-label={`Reply to ${item.author}`}/><button onClick={() => addReply(item.id)} disabled={!reply[item.id]?.trim()} aria-label="Send reply"><Send size={13}/></button><button onClick={() => void copyLink(item.id)} aria-label="Copy annotation link"><Link2 size={13}/></button></div>
        </article>
      </div>
    })}
  </div>, root)
}

function highlightRange(range: Range, id: string) {
  const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer as Element
  if (!root) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node = walker.nextNode()
  while (node) { if (range.intersectsNode(node) && node.textContent?.trim()) nodes.push(node as Text); node = walker.nextNode() }
  nodes.reverse().forEach((text) => {
    const part = document.createRange()
    part.selectNodeContents(text)
    if (text === range.startContainer) part.setStart(text, range.startOffset)
    if (text === range.endContainer) part.setEnd(text, range.endOffset)
    if (part.collapsed) return
    const mark = document.createElement('mark')
    mark.dataset.annotationId = id
    mark.className = 'annotation-highlight'
    part.surroundContents(mark)
  })
}

function legacyAnchorId(id: string) {
  if (id === 'annotation-comment-1') return 'annotation-1'
  if (id === 'annotation-comment-2') return 'annotation-2'
  return undefined
}
