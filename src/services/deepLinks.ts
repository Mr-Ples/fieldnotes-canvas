export type DeepLinkKind = 'annotation' | 'canvas' | 'comment' | 'discord-message' | 'resource' | 'llm-chat' | 'heading' | 'external' | 'unknown'

export function deepLinkTarget(hash = window.location.hash) {
  return hash.replace(/^#/, '')
}

export function deepLinkKind(target = deepLinkTarget()): DeepLinkKind {
  if (target.startsWith('annotation-comment')) return 'annotation'
  if (target.startsWith('canvas-')) return 'canvas'
  if (target.startsWith('discord-message-')) return 'discord-message'
  if (target.startsWith('chat-')) return 'llm-chat'
  if (target.startsWith('res-')) return 'resource'
  if (target.startsWith('comment-') || target.startsWith('reply-')) return 'comment'
  if (target && typeof document !== 'undefined') {
    const element = document.getElementById(target)
    if (element?.matches('h1, h2, h3, h4, h5, h6')) return 'heading'
  }
  return 'unknown'
}

export function linkKindForHref(href: string, base = window.location.href): DeepLinkKind {
  try {
    const url = new URL(href, base)
    const current = new URL(base)
    if (url.origin === current.origin && url.pathname === current.pathname && url.hash) {
      const target = url.hash.slice(1)
      const kind = deepLinkKind(target)
      if (kind !== 'unknown') return kind
      if (url.searchParams.has('canvas')) return 'heading'
      return kind
    }
    return 'external'
  } catch { return 'unknown' }
}

export function navigateToDeepLink(target: string) {
  const hash = target.startsWith('#') ? target : `#${target}`
  const previous = window.location.href
  if (window.location.hash !== hash) window.history.pushState(null, '', hash)
  window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: previous, newURL: window.location.href }))
}

export function scrollDeepLinkIntoView(target: string, behavior: ScrollBehavior = 'auto') {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      revealDeepLinkTarget(target, behavior)
    })
  })
}

function revealDeepLinkTarget(target: string, behavior: ScrollBehavior) {
  const element = document.getElementById(target)
  if (!element) return
  document.querySelectorAll('.deep-link-selected').forEach((current) => current.classList.remove('deep-link-selected'))
  element.classList.add('deep-link-selected')
  if (element.matches('h1, h2, h3, h4, h5, h6') && element.closest('.center-panel')) {
    scrollHeadingToCanvasOffset(element, behavior)
    return
  }
  if (isFullyInView(element)) return
  const appShell = document.querySelector<HTMLElement>('.app-shell')
  const appScrollTop = appShell?.scrollTop
  element.scrollIntoView({ behavior, block: 'center' })
  if (!element.closest('.center-panel') && appShell && appScrollTop !== undefined) {
    requestAnimationFrame(() => { appShell.scrollTop = appScrollTop })
  }
}

function scrollHeadingToCanvasOffset(element: HTMLElement, behavior: ScrollBehavior) {
  const scrollRoot = element.closest<HTMLElement>('.app-shell')
  if (!scrollRoot) return
  const stickyOffset = Number.parseFloat(getComputedStyle(scrollRoot).getPropertyValue('--canvas-scroll-offset')) || 160
  const top = element.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop - stickyOffset
  scrollRoot.scrollTo({ top, behavior })
}

function isFullyInView(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  const scrollParent = element.closest<HTMLElement>('.app-shell')
  const containerRect = scrollParent?.getBoundingClientRect()
  const top = containerRect?.top ?? 0
  const bottom = containerRect?.bottom ?? window.innerHeight
  return rect.top >= top + 8 && rect.bottom <= bottom - 8
}
