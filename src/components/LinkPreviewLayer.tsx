import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { linkLabel, resolveLinkPreview } from '../services/linkContent'

type PreviewState = {
  anchor: DOMRect
  top: number
  left: number
  width: number
} & NonNullable<ReturnType<typeof resolveLinkPreview>>

export default function LinkPreviewLayer({ rootRef }: { rootRef: RefObject<HTMLElement | null> }) {
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const hoverTimer = useRef<number | null>(null)
  const hoverHref = useRef('')
  const cardRef = useRef<HTMLDivElement>(null)
  const overCard = useRef(false)

  const clear = () => {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    hoverHref.current = ''
    overCard.current = false
    setPreview(null)
  }

  const clearSoon = (href: string) => {
    window.setTimeout(() => {
      if (!overCard.current && hoverHref.current === href) clear()
    }, 80)
  }

  const createPreviewState = (link: HTMLAnchorElement, delay: boolean) => {
    const next = resolveLinkPreview(link.href)
    if (!next) return
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hoverHref.current = link.href
    const show = () => {
      if (hoverHref.current !== link.href) return
      const anchor = link.getBoundingClientRect()
      const width = Math.min(360, window.innerWidth - 24)
      const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))
      setPreview({ ...next, anchor, top: Math.max(12, anchor.top - 12), left, width })
    }
    if (delay) hoverTimer.current = window.setTimeout(show, 300)
    else show()
  }

  useLayoutEffect(() => {
    if (!preview || !cardRef.current) return
    const card = cardRef.current
    const rect = card.getBoundingClientRect()
    const top = preview.anchor.top - rect.height - 10 >= 12
      ? preview.anchor.top - rect.height - 10
      : Math.min(window.innerHeight - rect.height - 12, preview.anchor.bottom + 10)
    const left = Math.max(12, Math.min(preview.left, window.innerWidth - rect.width - 12))
    if (Math.abs(top - preview.top) > 0.5 || Math.abs(left - preview.left) > 0.5) {
      setPreview({ ...preview, top, left })
    }
  }, [preview])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const onPointerOver = (event: Event) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]')
      if (!link || !root.contains(link)) return
      if (link.classList.contains('heading-link')) return
      if (hoverHref.current === link.href) return
      clear()
      createPreviewState(link, true)
    }

    const onFocusIn = (event: Event) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]')
      if (!link || !root.contains(link)) return
      if (link.classList.contains('heading-link')) return
      clear()
      createPreviewState(link, false)
    }

    const onFocusOut = (event: FocusEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]')
      if (!link) return
      if (event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) return
      if (event.relatedTarget instanceof Element && event.relatedTarget.closest('.link-preview-card')) return
      clearSoon(link.href)
    }

    const onPointerOut = (event: PointerEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]')
      if (!link) return
      if (event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) return
      if (event.relatedTarget instanceof Element && event.relatedTarget.closest('.link-preview-card')) return
      clearSoon(link.href)
    }

    const onScroll = () => clear()
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest('.link-preview-card')) return
      clear()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear()
    }

    root.addEventListener('pointerover', onPointerOver)
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)
    root.addEventListener('pointerout', onPointerOut)
    root.addEventListener('keydown', onKeyDown)
    const scrollRoot = root.closest<HTMLElement>('.app-shell')
    scrollRoot?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onScroll)
    return () => {
      clear()
      root.removeEventListener('pointerover', onPointerOver)
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
      root.removeEventListener('pointerout', onPointerOut)
      root.removeEventListener('keydown', onKeyDown)
      scrollRoot?.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onScroll)
    }
  }, [rootRef])

  if (!preview) return null
  const repeatsAuthor = preview.author && preview.title.trim().toLowerCase() === preview.author.name.trim().toLowerCase()

  return createPortal(
    <div
      ref={cardRef}
      className="link-preview-card"
      style={{ top: preview.top, left: preview.left, width: preview.width }}
      role="dialog"
      aria-label={`${linkLabel(preview.kind)} preview`}
      onPointerEnter={() => { overCard.current = true }}
      onPointerLeave={clear}
    >
      <div className="link-preview-head">
        {preview.author ? <div className="link-preview-author">{preview.author.avatar ? <img src={preview.author.avatar} alt="" /> : <span>{preview.author.initials}</span>}<strong>{preview.author.name}</strong></div> : <strong>{preview.title}</strong>}
        <span>{linkLabel(preview.kind)}</span>
      </div>
      {preview.author && !repeatsAuthor && <h4>{preview.title}</h4>}
      {preview.subtitle && <p className="link-preview-subtitle">{preview.subtitle}</p>}
      {preview.tags && preview.tags.length > 0 && <div className="link-preview-tags">{preview.tags.slice(0, 5).map((tag) => <span key={tag}>#{tag}</span>)}</div>}
      {preview.sectionTitle && <h4>{preview.sectionTitle}</h4>}
      {preview.quote && <blockquote>{preview.quote}</blockquote>}
      {preview.body ? <pre>{preview.body}</pre> : preview.excerpt && <p>{preview.excerpt}</p>}
    </div>,
    document.body,
  )
}
