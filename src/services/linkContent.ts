import { canvases, comments, projects, resources, type Comment } from '../data'
import { seedAnnotations } from '../data/annotations'
import { deepLinkTarget, linkKindForHref, type DeepLinkKind } from './deepLinks'
import type { ChatMessage } from './api'

export type LinkPreview = {
  kind: DeepLinkKind
  title: string
  href: string
  meta?: string
  subtitle?: string
  tags?: string[]
  excerpt?: string
  sectionTitle?: string
  quote?: string
  author?: { name: string; avatar?: string; initials?: string }
  body?: string
}

const ICONS: Record<'files' | 'message-square' | 'messages-square' | 'message-square-text' | 'link2' | 'external-link' | 'hash', string> = {
  files: svg('<path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"></path><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"></path><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"></path>'),
  'message-square': svg('<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path>'),
  'messages-square': svg('<path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"></path>'),
  'message-square-text': svg('<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path><path d="M7 11h10"></path><path d="M7 15h6"></path><path d="M7 7h8"></path>'),
  link2: svg('<path d="M9 17H7A5 5 0 0 1 7 7h2"></path><path d="M15 7h2a5 5 0 1 1 0 10h-2"></path><line x1="8" x2="16" y1="12" y2="12"></line>'),
  'external-link': svg('<path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>'),
  hash: svg('<line x1="4" x2="20" y1="9" y2="9"></line><line x1="4" x2="20" y1="15" y2="15"></line><line x1="10" x2="8" y1="3" y2="21"></line><line x1="16" x2="14" y1="3" y2="21"></line>'),
}

export function linkLabel(kind: DeepLinkKind) {
  if (kind === 'resource') return 'Resource'
  if (kind === 'canvas') return 'Canvas'
  if (kind === 'annotation') return 'Annotation'
  if (kind === 'comment') return 'Discussion'
  if (kind === 'llm-chat' || kind === 'discord-message') return 'Chat'
  if (kind === 'heading') return 'Heading'
  if (kind === 'external') return 'External'
  return 'Link'
}

export function decorateEditorLinks(root: HTMLElement | null) {
  if (!root) return
  decorateHeadings(root)
  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    if (link.classList.contains('heading-link')) return
    const kind = linkKindForHref(link.getAttribute('href') ?? '')
    link.dataset.linkKind = kind
    link.removeAttribute('title')
    ensureMarker(link, kind)
  })
}

export function resolveLinkPreview(href: string): LinkPreview | null {
  const kind = linkKindForHref(href)
  let url: URL
  try {
    url = new URL(href, window.location.href)
  } catch {
    return null
  }
  const target = kind === 'external' ? '' : deepLinkTarget(url.hash || href)
  if (kind === 'external') {
    return { kind, href: url.toString(), title: url.toString() }
  }
  if (kind === 'canvas') {
    const canvasId = target.replace(/^canvas-/, '')
    const canvas = readStored('fieldnotes:canvases', canvases).find((item) => item.id === canvasId)
    if (!canvas) return { kind, href: url.toString(), title: canvasId, meta: 'Canvas link' }
    const tags = readStored<string[]>('fieldnotes:tags', [])
    return {
      kind,
      href: url.toString(),
      title: canvas.title,
      subtitle: canvasSubtitle(canvas.id),
      tags,
      meta: `${canvas.emoji} Canvas · ${canvas.updated}`,
      ...canvasSection(canvas.id),
    }
  }
  if (kind === 'resource') {
    const resource = readStored('fieldnotes:resources', resources).find((item) => item.id === target)
    return resource ? { kind, href: url.toString(), title: resource.title, meta: resource.meta, excerpt: firstSnippet(resource.content) } : { kind, href: url.toString(), title: target, meta: 'Resource link' }
  }
  if (kind === 'comment') {
    const comment = findComment(readStored('fieldnotes:comments', comments), target)
    return comment ? { kind, href: url.toString(), title: comment.author, meta: 'Discussion comment', excerpt: firstSnippet([comment.body, ...(comment.replies ?? []).map((reply) => typeof reply === 'string' ? reply : reply.body)].filter(Boolean).join(' ')) } : { kind, href: url.toString(), title: target, meta: 'Discussion link' }
  }
  if (kind === 'llm-chat') {
    const messageId = target.replace(/^chat-/, '')
    const message = readStored<ChatMessage[]>('fieldnotes:chat', []).find((item) => item.id === messageId)
    return message ? { kind, href: url.toString(), title: message.role === 'assistant' ? 'Assistant reply' : 'Your message', meta: 'AI chat', excerpt: firstSnippet(message.content) } : { kind, href: url.toString(), title: target, meta: 'Chat link' }
  }
  if (kind === 'discord-message') {
    const message = discordMessage(target, url.searchParams.get('canvas') ?? undefined)
    return message ? {
      kind,
      href: url.toString(),
      title: message.authorName,
      meta: message.createdAt ? new Date(message.createdAt).toLocaleString() : undefined,
      author: { name: message.authorName, avatar: message.authorAvatar, initials: initials(message.authorName) },
      body: message.content,
      excerpt: firstSnippet(message.content),
    } : { kind, href: url.toString(), title: target, meta: 'Chat link' }
  }
  if (kind === 'annotation') {
    const annotation = readStored('fieldnotes:annotations', seedAnnotations).find((item) => item.id === target)
    return annotation ? {
      kind,
      href: url.toString(),
      title: annotation.author,
      meta: `Annotation · ${annotation.time}`,
      quote: annotation.quote,
      author: { name: annotation.author, avatar: annotation.avatar, initials: annotation.initials },
      body: annotation.body,
      excerpt: firstSnippet([annotation.quote, annotation.body, ...(annotation.replies ?? []).map((reply) => typeof reply === 'string' ? reply : reply.body)].filter(Boolean).join(' ')),
    } : { kind, href: url.toString(), title: target, meta: 'Annotation link' }
  }
  if (kind === 'heading') {
    const linkedCanvasId = url.searchParams.get('canvas') ?? undefined
    const currentCanvasId = readStored<{ id?: string }>('fieldnotes:active-canvas', { id: canvases[0]?.id }).id
    const heading = linkedCanvasId && linkedCanvasId !== currentCanvasId ? null : document.getElementById(target)
    const stored = linkedCanvasId ? storedHeading(linkedCanvasId, target) : null
    const canvas = linkedCanvasId ? readStored('fieldnotes:canvases', canvases).find((item) => item.id === linkedCanvasId) : undefined
    const title = heading ? cleanText(heading) : stored?.title
    return title ? {
      kind,
      href: url.toString(),
      title,
      meta: 'Heading',
      subtitle: canvas && linkedCanvasId !== currentCanvasId ? canvas.title : undefined,
      excerpt: heading ? headingSnippet(heading) : stored?.excerpt,
    } : { kind, href: url.toString(), title: target, meta: 'Heading link', subtitle: canvas && linkedCanvasId !== currentCanvasId ? canvas.title : undefined }
  }
  return { kind, href: url.toString(), title: linkLabel(kind), meta: url.toString() }
}

export function canvasHeadings(canvasId: string) {
  const html = canvasHtml(canvasId)
  if (!html) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const used = new Set(Array.from(doc.body.querySelectorAll<HTMLElement>('[id]')).filter((element) => !element.matches('h1, h2, h3')).map((element) => element.id))
  return Array.from(doc.body.querySelectorAll<HTMLElement>('h1, h2, h3')).flatMap((heading, index) => {
    const title = cleanText(heading)
    if (!title) return []
    if (!heading.id || used.has(heading.id)) heading.id = uniqueSlug(slugForHeading(title, index), used)
    else used.add(heading.id)
    return [{ id: heading.id, title, level: Number(heading.tagName.slice(1)) }]
  })
}

function decorateHeadings(root: HTMLElement) {
  root.querySelectorAll('.heading-link').forEach((link) => {
    if (!link.parentElement?.matches('h1, h2, h3, h4, h5, h6')) link.remove()
  })
  const headingSelector = 'h1, h2, h3, h4, h5, h6'
  const used = new Set(Array.from(root.querySelectorAll<HTMLElement>('[id]')).filter((element) => !element.matches(headingSelector)).map((element) => element.id))
  root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6').forEach((heading, index) => {
    const title = cleanText(heading)
    if (!title) {
      heading.remove()
      return
    }
    if (!heading.id || used.has(heading.id)) heading.id = uniqueSlug(slugForHeading(title, index), used)
    else used.add(heading.id)
    let link = heading.querySelector<HTMLAnchorElement>(':scope > .heading-link')
    if (!link) {
      link = document.createElement('a')
      link.className = 'heading-link'
      link.setAttribute('contenteditable', 'false')
      link.setAttribute('aria-label', 'Link to this heading')
      link.innerHTML = ICONS.link2
      heading.append(link)
    }
    link.removeAttribute('title')
    link.href = `#${heading.id}`
  })
}

function ensureMarker(link: HTMLAnchorElement, kind: DeepLinkKind) {
  const marker = link.querySelector<HTMLElement>('.note-link-marker') ?? document.createElement('span')
  marker.className = 'note-link-marker'
  marker.setAttribute('aria-hidden', 'true')
  marker.setAttribute('contenteditable', 'false')
  marker.innerHTML = iconMarkup(kind)
  if (!marker.isConnected) link.append(marker)
}

function iconMarkup(kind: DeepLinkKind) {
  const icon = kind === 'resource' ? ICONS.hash
    : kind === 'canvas' ? ICONS.files
    : kind === 'annotation' || kind === 'comment' ? ICONS['message-square-text']
      : kind === 'llm-chat' ? ICONS['message-square']
        : kind === 'discord-message' ? ICONS['messages-square']
          : kind === 'external' ? ICONS['external-link']
            : ICONS.link2
  return icon
}

function svg(inner: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}

function readStored<T>(key: string, fallback: T) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function canvasSubtitle(canvasId: string) {
  const canvas = readStored('fieldnotes:canvases', canvases).find((item) => item.id === canvasId)
  if (canvas?.subtitle) return canvas.subtitle
  const projectId = canvas?.projectId ?? (canvas?.group === 'Active' ? 'attention-project' : canvas?.group === 'Archive' ? 'fieldwork' : undefined)
  const project = projectId ? readStored('fieldnotes:projects', projects).find((item) => item.id === projectId) : undefined
  return project?.title ? `${project.title} canvas` : 'Canvas'
}

function firstSnippet(value?: string) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? ''
  return normalized.length > 260 ? `${normalized.slice(0, 257)}...` : normalized
}

function findComment(items: Comment[], id: string): Comment | undefined {
  for (const item of items) {
    if (item.id === id) return item
    const reply = item.replies ? findComment(item.replies, id) : undefined
    if (reply) return reply
  }
  return undefined
}

function canvasSection(canvasId: string) {
  const html = canvasHtml(canvasId)
  if (!html) return {}
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const heading = doc.body.querySelector('h1, h2, h3, h4, h5, h6')
  let paragraph: Element | null = null
  let node = heading?.nextElementSibling ?? doc.body.firstElementChild
  while (node) {
    if (node !== heading && node.matches('p, blockquote, ul, ol')) {
      paragraph = node
      break
    }
    if (heading && node.matches('h1, h2, h3, h4, h5, h6')) break
    node = node.nextElementSibling
  }
  return {
    sectionTitle: cleanText(heading),
    excerpt: firstSnippet(cleanText(paragraph)),
  }
}

function canvasHtml(canvasId: string) {
  const activeCanvasId = readStored<{ id?: string }>('fieldnotes:active-canvas', { id: canvases[0]?.id }).id
  const liveHtml = activeCanvasId === canvasId ? document.querySelector<HTMLElement>('.note-editor')?.innerHTML : ''
  const saved = localStorage.getItem(`fieldnotes:notes-html:${canvasId}`)
  return liveHtml || saved || ''
}

function storedHeading(canvasId: string, headingId: string) {
  const html = canvasHtml(canvasId)
  if (!html) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const heading = doc.getElementById(headingId)
  return heading ? { title: cleanText(heading), excerpt: headingSnippet(heading) } : null
}

function headingSnippet(heading: Element) {
  const parts: string[] = []
  let node = heading.nextElementSibling
  while (node && !node.matches('h1, h2, h3, h4, h5, h6')) {
    if (node.matches('p, blockquote, ul, ol')) parts.push(cleanText(node))
    if (parts.join(' ').length > 260) break
    node = node.nextElementSibling
  }
  return firstSnippet(parts.join(' '))
}

function cleanText(element: Element | null) {
  if (!element) return ''
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll('.note-link-marker, .heading-link').forEach((node) => node.remove())
  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function slugForHeading(text: string, index: number) {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72)
  return slug || `document-heading-${index}`
}

function uniqueSlug(base: string, used: Set<string>) {
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) candidate = `${base}-${suffix++}`
  used.add(candidate)
  return candidate
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'CH'
}

function discordMessage(target: string, canvasId?: string) {
  const element = document.getElementById(target)
  if (element?.dataset.discordAuthorName) {
    return {
      id: target.replace(/^discord-message-/, ''),
      origin: element.dataset.discordOrigin ?? 'website',
      authorName: element.dataset.discordAuthorName,
      authorAvatar: element.dataset.discordAuthorAvatar,
      content: element.dataset.discordContent ?? '',
      createdAt: Number(element.dataset.discordCreatedAt ?? 0),
    }
  }
  const messageId = target.replace(/^discord-message-/, '')
  const active = canvasId ?? readStored<{ id?: string }>('fieldnotes:active-canvas', {}).id
  const messages = active ? readStored<Array<{ id: string; origin: string; authorName: string; authorAvatar?: string; content: string; createdAt: number }>>(`fieldnotes:discord-messages:${active}`, []) : []
  return messages.find((message) => message.id === messageId)
}
