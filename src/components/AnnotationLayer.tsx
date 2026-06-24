import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { BookmarkPlus, Check, Link2, MessageSquareText, MoreHorizontal, Plus, Send, Trash2, X } from 'lucide-react'
import { Avatar } from './Primitives'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { showConfirm, showToast } from './Popups'

type AnnotationReply = string | { id?: string; author: string; authorId?: string; avatar?: string; initials: string; body: string }
type Annotation = { id: string; anchorId?: string; quote: string; author: string; authorId?: string; avatar?: string; initials: string; time: string; body: string; replies?: AnnotationReply[] }
type Position = { id: string; top: number; compact: boolean; anchorTop: number; anchorBottom: number; anchorRight: number }

const seedAnnotations: Annotation[] = [
  { id: 'annotation-comment-1', anchorId: 'annotation-1', quote: '“what kind of attention does this moment deserve?”', author: 'Mara Chen', initials: 'MC', time: '24m ago', body: 'This framing is strong. It moves the responsibility back to the designer, not the user.' },
  { id: 'annotation-comment-2', anchorId: 'annotation-2', quote: 'The return is as important as the capture.', author: 'Jon Bell', initials: 'JB', time: '1h ago', body: 'Could we connect this to the idea of “resumability” in tools for thought?' },
]

export default function AnnotationLayer({ editorRef, containerRef, canvasId, canInteract, canSaveResource, mode, onDocumentChange }: { editorRef: RefObject<HTMLElement | null>; containerRef: RefObject<HTMLElement | null>; canvasId: string; canInteract: boolean; canSaveResource: boolean; mode: 'track' | 'hover' | 'hidden'; onDocumentChange: () => void }) {
  const [items, setItems] = useLocalStorage<Annotation[]>('fieldnotes:annotations', seedAnnotations)
  const [selection, setSelection] = useState<{ range: Range; quote: string; rect: DOMRect } | null>(null)
  const [composing, setComposing] = useState(false)
  const [body, setBody] = useState('')
  const [reply, setReply] = useState<Record<string, string>>({})
  const [menu, setMenu] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [activeOrigin, setActiveOrigin] = useState<'anchor' | 'card'>('anchor')
  const [positions, setPositions] = useState<Position[]>([])
  const [identity, setIdentity] = useState<{ id: string; displayName: string; avatar?: string } | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const locateRef = useRef<() => void>(() => { })
  const itemsRef = useRef(items)
  const stableTops = useRef(new Map<string, number>())
  const cardHeights = useRef(new Map<string, number>())
  const positionsRef = useRef<Position[]>([])

  useEffect(() => {
    void fetch('/api/discord/me').then((response) => response.ok ? response.json() : null).then((result: { user?: { id: string; displayName: string; avatar?: string } } | null) => setIdentity(result?.user ?? null)).catch(() => { })
    const sync = (event: Event) => setIdentity((event as CustomEvent<{ id: string; displayName: string; avatar?: string } | null>).detail)
    window.addEventListener('fieldnotes:discord-auth-synced', sync)
    return () => window.removeEventListener('fieldnotes:discord-auth-synced', sync)
  }, [])

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
      const rightPanelOpen = !container.closest('.app-shell')?.classList.contains('right-collapsed')
      const compact = rightPanelOpen && containerRect.right - editorRect.right < 310
      return [{ id: item.id, top, compact, anchorTop, anchorBottom: anchorTop + rect.height, anchorRight: rect.right - containerRect.left }]
    }).sort((a, b) => a.top - b.top)
    const heightFor = (id: string) => cardHeights.current.get(id) ?? Math.min(220, 138 + (items.find((item) => item.id === id)?.replies?.length ?? 0) * 48)
    const activeIndex = active ? raw.findIndex((position) => position.id === active) : -1
    if (activeIndex < 0) {
      let nextTop = 70
      setPositions(raw.map((position) => {
        const stored = stableTops.current.get(position.id)
        const top = stored ?? Math.max(position.top, nextTop)
        stableTops.current.set(position.id, top)
        nextTop = Math.max(nextTop, top + heightFor(position.id) + 14)
        return { ...position, top }
      }))
      return
    }
    const arranged = raw.map((position) => ({ ...position, top: stableTops.current.get(position.id) ?? position.top }))
    if (activeOrigin === 'card') {
      const previousById = new Map(positionsRef.current.map((position) => [position.id, position]))
      const stationary = arranged.map((position) => ({ ...position, top: previousById.get(position.id)?.top ?? position.top }))
      const geometryChanged = stationary.length !== positionsRef.current.length || stationary.some((position) => {
        const previous = previousById.get(position.id)
        return !previous || previous.compact !== position.compact || Math.abs(previous.anchorRight - position.anchorRight) > 1
      })
      if (geometryChanged) setPositions(stationary)
      return
    }
    const previousById = new Map(positionsRef.current.map((position) => [position.id, position]))
    const activePosition = arranged[activeIndex]
    const activeHeight = heightFor(activePosition.id)
    const scrollRoot = container.closest<HTMLElement>('.app-shell')
    const visibleTop = (scrollRoot?.scrollTop ?? 0) + 61
    const visibleBottom = (scrollRoot?.scrollTop ?? 0) + (scrollRoot?.clientHeight ?? window.innerHeight) - 12
    const renderedTop = previousById.get(activePosition.id)?.top ?? activePosition.top
    const fullyVisible = renderedTop >= visibleTop && renderedTop + activeHeight <= visibleBottom
    if (fullyVisible) {
      const stationary = arranged.map((position) => ({ ...position, top: previousById.get(position.id)?.top ?? position.top }))
      const geometryChanged = stationary.some((position, index) => positionsRef.current[index]?.compact !== position.compact
        || Math.abs((positionsRef.current[index]?.anchorRight ?? 0) - position.anchorRight) > 1
        || Math.abs((positionsRef.current[index]?.top ?? position.top) - position.top) > 1)
      if (geometryChanged) setPositions(stationary)
      return
    }
    const highestVisibleTop = Math.max(visibleTop, visibleBottom - activeHeight)
    activePosition.top = Math.min(Math.max(raw[activeIndex].top, visibleTop), highestVisibleTop)
    for (let index = activeIndex - 1; index >= 0; index--) {
      arranged[index].top = Math.min(arranged[index].top, arranged[index + 1].top - heightFor(arranged[index].id) - 14)
    }
    for (let index = activeIndex + 1; index < arranged.length; index++) {
      arranged[index].top = Math.max(arranged[index].top, arranged[index - 1].top + heightFor(arranged[index - 1].id) + 14)
    }
    setPositions(arranged)
  }, [active, activeOrigin, containerRef, editorRef, items])

  useLayoutEffect(() => { locateRef.current = locate }, [locate])
  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => { positionsRef.current = positions }, [positions])

  useLayoutEffect(() => {
    if (!positions.length) return
    let changed = false
    document.querySelectorAll<HTMLElement>('[data-annotation-thread-id]').forEach((thread) => {
      const id = thread.dataset.annotationThreadId
      const height = thread.querySelector<HTMLElement>('.annotation-card')?.offsetHeight
      const slotHeight = height ? Math.min(height, 220) : 0
      if (id && slotHeight && Math.abs((cardHeights.current.get(id) ?? 0) - slotHeight) > 1) { cardHeights.current.set(id, slotHeight); changed = true }
    })
    if (changed) {
      let nextTop = 70
      const ordered = [...positions].sort((a, b) => a.top - b.top)
      ordered.forEach((position) => {
        const top = Math.max(stableTops.current.get(position.id) ?? position.top, nextTop)
        stableTops.current.set(position.id, top)
        nextTop = top + (cardHeights.current.get(position.id) ?? 138) + 14
      })
      locateRef.current()
    }
  }, [items, positions.length])

  useLayoutEffect(() => { locate() }, [locate, canvasId])
  useLayoutEffect(() => {
    const container = containerRef.current
    const editor = editorRef.current
    if (!editor || !container) return
    const update = () => locate()
    const panelsChanged = () => requestAnimationFrame(() => locateRef.current())
    const scrollRoot = container.closest<HTMLElement>('.app-shell')
    window.addEventListener('resize', update)
    window.addEventListener('fieldnotes:panels-changed', panelsChanged)
    const observer = new ResizeObserver(update)
    observer.observe(container); observer.observe(editor)
    if (scrollRoot) observer.observe(scrollRoot)
    const classObserver = scrollRoot ? new MutationObserver(() => requestAnimationFrame(() => locateRef.current())) : null
    if (scrollRoot) classObserver?.observe(scrollRoot, { attributes: true, attributeFilter: ['class'] })
    return () => { window.removeEventListener('resize', update); window.removeEventListener('fieldnotes:panels-changed', panelsChanged); classObserver?.disconnect(); observer.disconnect() }
  }, [containerRef, editorRef, locate])

  useEffect(() => {
    const reveal = () => {
      const id = window.location.hash.slice(1)
      const item = itemsRef.current.find((candidate) => candidate.id === id)
      if (!item) return
      setActiveOrigin('anchor')
      setActive(id)
      const anchorId = item.anchorId ?? legacyAnchorId(item.id)
      const anchor = editorRef.current?.querySelector<HTMLElement>(`[data-annotation-id="${CSS.escape(id)}"]`) ?? (anchorId ? document.getElementById(anchorId) : null)
      anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      requestAnimationFrame(() => locateRef.current())
    }
    reveal(); window.addEventListener('hashchange', reveal)
    return () => window.removeEventListener('hashchange', reveal)
  }, [editorRef])

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
    const over = (event: Event) => {
      const id = (event.target as Element).closest<HTMLElement>('[data-annotation-id]')?.dataset.annotationId
      if (id) { setActiveOrigin('anchor'); setActive(id) }
    }
    const move = (event: PointerEvent) => {
      const id = (event.target as Element).closest<HTMLElement>('[data-annotation-id]')?.dataset.annotationId
      if (id) { setActiveOrigin('anchor'); setActive(id) }
    }
    const click = (event: Event) => {
      const id = (event.target as Element).closest<HTMLElement>('[data-annotation-id]')?.dataset.annotationId
      if (id) { setActiveOrigin('anchor'); setActive(id) }
    }
    editor.addEventListener('mouseover', over); editor.addEventListener('pointermove', move); editor.addEventListener('focusin', over); editor.addEventListener('click', click)
    return () => { editor.removeEventListener('mouseover', over); editor.removeEventListener('pointermove', move); editor.removeEventListener('focusin', over); editor.removeEventListener('click', click) }
  }, [editorRef])

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target) return
      if (!target.closest('.annotation-menu')) setMenu(null)
      if (!target.closest('[data-annotation-id], .annotation-thread')) {
        positionsRef.current.forEach((position) => stableTops.current.set(position.id, position.top))
        setActive(null)
      }
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
    const author = identity?.displayName ?? 'You'
    const initials = author.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'YO'
    setItems([...items, { id, quote: selection.quote, author, authorId: identity?.id, avatar: identity?.avatar, initials, time: 'Now', body: body.trim() }])
    onDocumentChange(); closeComposer(); setActiveOrigin('anchor'); setActive(id)
    requestAnimationFrame(locate)
  }
  const addReply = (id: string) => {
    const value = reply[id]?.trim()
    if (!value) return
    const author = identity?.displayName ?? 'You'
    const initials = author.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'YO'
    setItems(items.map((item) => item.id === id ? { ...item, replies: [...(item.replies ?? []), { id: crypto.randomUUID(), author, authorId: identity?.id, avatar: identity?.avatar, initials, body: value }] } : item))
    setReply((current) => ({ ...current, [id]: '' }))
  }
  const removeReply = (annotationId: string, replyIndex: number) => {
    setItems(items.map((item) => item.id === annotationId ? { ...item, replies: item.replies?.filter((_, index) => index !== replyIndex) } : item))
    showToast('Annotation comment deleted')
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
  const saveAsResource = (item: Annotation) => {
    const key = 'fieldnotes:resources'
    const current = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[]
    const replies = (item.replies ?? []).map((value) => typeof value === 'string' ? `You: ${value}` : `${value.author}: ${value.body}`)
    localStorage.setItem(key, JSON.stringify([{ id: `res-annotation-${crypto.randomUUID()}`, kind: 'chat', title: `Annotation from ${item.author}`, meta: 'Annotation · Saved now', accent: '#b28a3d', content: [`“${item.quote}”`, `${item.author}: ${item.body}`, ...replies].join('\n\n') }, ...current]))
    window.dispatchEvent(new Event('fieldnotes:resources-changed'))
    setMenu(null)
    showToast('Annotation saved to resources')
  }

  const root = containerRef.current
  if (!root) return null
  if (mode === 'hidden') return null
  const rootRect = root.getBoundingClientRect()
  const trackLeft = Math.max(16, Math.min(root.clientWidth - 308, editorRef.current ? editorRef.current.getBoundingClientRect().right - rootRect.left + 18 : root.clientWidth - 308))
  return createPortal(<div className="annotation-ui" aria-live="polite">
    {canInteract && selection && !composing && <button className="annotation-add" style={{ top: selection.rect.top - rootRect.top + selection.rect.height / 2, left: trackLeft }} onMouseDown={(event) => event.preventDefault()} onClick={openComposer} aria-label="Add annotation to selection"><Plus size={14} /> Add annotation</button>}
    {selection && composing && <div className="annotation-composer" style={{ top: selection.rect.bottom - rootRect.top + 8, left: trackLeft }}>
      <div className="annotation-composer-head"><span><MessageSquareText size={14} /> New annotation</span><button onClick={closeComposer} aria-label="Cancel annotation"><X size={15} /></button></div>
      <blockquote>“{selection.quote}”</blockquote>
      <textarea ref={composerRef} value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') create() }} placeholder="Add a comment…" aria-label="Annotation comment" />
      <div><span>⌘ Enter to send</span><button disabled={!body.trim()} onClick={create}><Check size={13} /> Comment</button></div>
    </div>}
    <div className="annotation-thread-layer">{positions.map((position) => {
      const item = items.find((candidate) => candidate.id === position.id)
      if (!item) return null
      const foreground = active === item.id || menu === item.id
      const cardLeft = trackLeft
      const top = position.top
      return <div data-annotation-thread-id={item.id} className={`annotation-thread ${position.compact ? 'is-compact is-over-text' : ''} ${foreground ? 'is-active' : ''}`} style={{ top, left: cardLeft }} key={item.id} onMouseEnter={() => { setActiveOrigin('card'); setActive(item.id) }}>
        <article className="annotation-card" id={item.id}>
          <div className="annotation-meta"><Avatar initials={item.initials} src={item.avatar} name={item.author} color={item.author === 'You' ? 'ink' : 'sage'} /><div><strong>{item.author}</strong><time>{item.time}</time></div><div className="annotation-menu"><button aria-label="Annotation options" aria-expanded={menu === item.id} onClick={() => setMenu(menu === item.id ? null : item.id)}><MoreHorizontal size={16} /></button>{menu === item.id && <div role="menu"><button role="menuitem" onClick={() => void copyLink(item.id)}><Link2 size={13} /> Copy link</button>{canSaveResource && <button role="menuitem" onClick={() => saveAsResource(item)}><BookmarkPlus size={13} /> Save as resource</button>}{canInteract && <button role="menuitem" onClick={() => remove(item.id)}><Trash2 size={13} /> Delete thread</button>}</div>}</div></div>
          <blockquote className="annotation-quote">“{item.quote}”</blockquote>
          <p>{item.body}</p>
          {item.replies?.map((value, index, all) => { if (!foreground && all.length > 2 && index > 0 && index < all.length - 1) return index === 1 ? <div className="annotation-replies-hidden" key={`${item.id}-hidden`}>{all.length - 2} comments hidden</div> : null; const replyValue = typeof value === 'string' ? { id: undefined, author: 'You', authorId: undefined, avatar: undefined, initials: 'YO', body: value } : value; const mine = replyValue.author === 'You' || Boolean(identity?.id && replyValue.authorId === identity.id); return <div className="annotation-reply" key={replyValue.id ?? `${item.id}-${index}`}><Avatar initials={replyValue.initials} src={replyValue.avatar} name={replyValue.author} color="ink" /><p><strong>{replyValue.author}</strong>{replyValue.body}</p>{canInteract && mine && <button className="annotation-reply-delete" onClick={() => removeReply(item.id, index)} aria-label="Delete annotation comment"><Trash2 size={12} /></button>}</div> })}
          {canInteract && <div className="annotation-reply-box"><input value={reply[item.id] ?? ''} onChange={(event) => setReply((current) => ({ ...current, [item.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') addReply(item.id) }} placeholder="Reply…" aria-label={`Reply to ${item.author}`} /><button onClick={() => addReply(item.id)} disabled={!reply[item.id]?.trim()} aria-label="Send reply"><Send size={13} /></button><button onClick={() => void copyLink(item.id)} aria-label="Copy annotation link"><Link2 size={13} /></button></div>}
        </article>
      </div>
    })}</div>
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
