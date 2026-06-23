import { DurableObject } from 'cloudflare:workers'
import type { DiscordEvent } from './canvas-room'
export { CanvasRoom, DiscordChannelLink } from './canvas-room'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const MAX_JSON_BYTES = 64_000

type IncomingMessage = { role: 'user' | 'assistant'; content: string }
type DiscordQueueMessage = { canvasId: string; messageId: string; channelId: string; content: string; authorName: string; replyToDiscordId?: string }

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: securityHeaders(request) })
    if (!sameOrigin(request)) return json({ error: 'Cross-origin requests are not allowed' }, 403)

    const actor = request.headers.get('cf-connecting-ip')
      ?? request.headers.get('x-fieldnotes-device')?.slice(0, 128)
      ?? 'anonymous'
    if (!url.pathname.startsWith('/api/internal/discord/')) {
      const generalLimit = await env.API_RATE_LIMITER.limit({ key: actor })
      if (!generalLimit.success) return json({ error: 'Too many requests. Try again shortly.' }, 429)
    }

    try {
      if (url.pathname === '/api/chat' && request.method === 'POST') return await chat(request, env, actor)
      if (url.pathname === '/api/media/sign' && request.method === 'POST') return await signUpload(env)
      if (url.pathname === '/api/media/delete' && request.method === 'POST') return await deleteMedia(request, env)
      if (url.pathname === '/api/resources/link' && request.method === 'POST') return await ingestLink(request, ctx)
      if (url.pathname === '/api/shares' && request.method === 'POST') return await createShare(request, env)
      if (url.pathname.startsWith('/api/shares/') && request.method === 'GET') return await readShare(url, env)
      if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true })
      const canvasRoute = url.pathname.match(/^\/api\/canvases\/([^/]+)\/(messages|chat)$/)
      if (canvasRoute) return await canvasChat(request, env, decodeURIComponent(canvasRoute[1]), canvasRoute[2], actor)
      if (url.pathname === '/api/internal/discord/link' && request.method === 'POST') return await linkDiscordChannel(request, env)
      if (url.pathname === '/api/internal/discord/events' && request.method === 'POST') return await receiveDiscordEvent(request, env)
      return json({ error: 'Not found' }, 404)
    } catch (error) {
      if (error instanceof Response) return error
      console.error(JSON.stringify({ event: 'request_error', path: url.pathname, message: error instanceof Error ? error.message : 'Unknown error' }))
      return json({ error: 'The request could not be completed' }, 500)
    }
  },

  async queue(batch, env): Promise<void> {
    for (const item of batch.messages) {
      const job = item.body as DiscordQueueMessage
      try {
        const response = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(job.channelId)}/messages`, {
          method: 'POST',
          headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            content: `**${job.authorName.replaceAll('*', '')}**\n${job.content}`.slice(0, 2_000),
            allowed_mentions: { parse: [] },
            message_reference: job.replyToDiscordId ? { message_id: job.replyToDiscordId, fail_if_not_exists: false } : undefined,
          }),
          signal: AbortSignal.timeout(15_000),
        })
        if (response.status === 429) {
          const delaySeconds = Math.max(1, Math.ceil(Number(response.headers.get('retry-after') ?? 1)))
          item.retry({ delaySeconds: Math.min(delaySeconds, 86_400) })
          continue
        }
        if (response.status >= 400 && response.status < 500) {
          await env.CANVAS_ROOMS.getByName(job.canvasId).markFailed(job.messageId)
          console.error(JSON.stringify({ event: 'discord_delivery_rejected', status: response.status, messageId: job.messageId }))
          item.ack()
          continue
        }
        if (!response.ok) throw new Error(`Discord returned ${response.status}`)
        const result = await response.json() as { id: string }
        await env.CANVAS_ROOMS.getByName(job.canvasId).markDelivered(job.messageId, result.id)
        item.ack()
      } catch (error) {
        console.error(JSON.stringify({ event: 'discord_delivery_failed', messageId: job.messageId, error: error instanceof Error ? error.message : 'Unknown error' }))
        if (item.attempts >= 5) {
          await env.CANVAS_ROOMS.getByName(job.canvasId).markFailed(job.messageId)
          item.ack()
        } else item.retry({ delaySeconds: Math.min(60, 2 ** item.attempts) })
      }
    }
  },
} satisfies ExportedHandler<Env>

async function canvasChat(request: Request, env: Env, canvasId: string, action: string, actor: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(canvasId)) return json({ error: 'Invalid canvas' }, 400)
  const room = env.CANVAS_ROOMS.getByName(canvasId)
  if (action === 'chat') {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'Expected WebSocket' }, 426)
    return room.fetch(request)
  }
  if (request.method === 'GET') {
    const before = Number(new URL(request.url).searchParams.get('before')) || undefined
    return json({ messages: await room.listMessages(50, before) })
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const body = await readJson<{ content?: string; authorName?: string; replyTo?: string }>(request)
  const content = body.content?.trim()
  if (!content || content.length > 2_000) return json({ error: 'Message must be between 1 and 2,000 characters' }, 400)
  const message = await room.postWebsite({ authorId: actor, authorName: body.authorName?.trim().slice(0, 80) || 'Website user', content, replyTo: body.replyTo })
  if (message.discordChannelId) {
    let replyToDiscordId: string | undefined
    if (message.replyTo) {
      const recent = await room.listMessages(100)
      replyToDiscordId = recent.find((candidate) => candidate.id === message.replyTo)?.discordMessageId
    }
    await env.DISCORD_OUTBOUND.send({ canvasId, messageId: message.id, channelId: message.discordChannelId, content, authorName: message.authorName, replyToDiscordId } satisfies DiscordQueueMessage)
  }
  return json({ message }, 201)
}

async function linkDiscordChannel(request: Request, env: Env) {
  const body = await verifiedBridgeJson<{ canvasId?: string; channelId?: string; guildId?: string }>(request, env)
  if (!body.canvasId || !body.channelId || !body.guildId || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.canvasId) || !/^\d{15,22}$/.test(body.channelId) || !/^\d{15,22}$/.test(body.guildId)) return json({ error: 'Invalid link request' }, 400)
  const room = env.CANVAS_ROOMS.getByName(body.canvasId)
  const channel = env.DISCORD_CHANNELS.getByName(body.channelId)
  const [previousChannel, previousCanvas] = await Promise.all([room.getDiscordChannel(), channel.getCanvas()])
  if (previousChannel && previousChannel.channelId !== body.channelId) await env.DISCORD_CHANNELS.getByName(previousChannel.channelId).clearCanvas(body.canvasId)
  if (previousCanvas && previousCanvas !== body.canvasId) await env.CANVAS_ROOMS.getByName(previousCanvas).clearDiscordChannel(body.channelId)
  await room.setDiscordChannel(body.channelId, body.guildId)
  await channel.setCanvas(body.canvasId)
  return json({ linked: true })
}

async function receiveDiscordEvent(request: Request, env: Env) {
  const event = await verifiedBridgeJson<DiscordEvent>(request, env)
  if (!event.channelId || !event.messageId) return json({ error: 'Invalid Discord event' }, 400)
  const canvasId = await env.DISCORD_CHANNELS.getByName(event.channelId).getCanvas()
  if (!canvasId) return json({ ignored: true, reason: 'Channel is not linked' }, 202)
  await env.CANVAS_ROOMS.getByName(canvasId).ingestDiscord(event)
  return json({ accepted: true })
}

async function verifiedBridgeJson<T>(request: Request, env: Env): Promise<T> {
  const timestamp = request.headers.get('x-fieldnotes-timestamp') ?? ''
  const signature = request.headers.get('x-fieldnotes-signature') ?? ''
  const age = Math.abs(Date.now() - Number(timestamp))
  if (!timestamp || !signature || !Number.isFinite(age) || age > 5 * 60_000) throw new Response('Unauthorized', { status: 401 })
  const body = await readBoundedText(request, MAX_JSON_BYTES)
  if (!await verifyHmac(env.DISCORD_BRIDGE_SECRET, `${timestamp}.${body}`, signature)) throw new Response('Unauthorized', { status: 401 })
  try { return JSON.parse(body) as T } catch { throw new Response('Invalid JSON', { status: 400 }) }
}

async function verifyHmac(secret: string, value: string, signature: string) {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const bytes = new Uint8Array(signature.match(/.{2}/g)!.map((value) => Number.parseInt(value, 16)))
  return await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(value))
}

export class ShareStore extends DurableObject<Env> {
  async save(snapshot: Record<string, string>) {
    await this.ctx.storage.put('snapshot', snapshot)
    await this.ctx.storage.put('createdAt', Date.now())
  }

  async load() {
    return await this.ctx.storage.get<Record<string, string>>('snapshot') ?? null
  }
}

async function createShare(request: Request, env: Env) {
  const { snapshot } = await readJson<{ snapshot?: Record<string, string> }>(request, 550_000)
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return json({ error: 'Invalid canvas snapshot' }, 400)
  const serialized = JSON.stringify(snapshot)
  if (serialized.length > 500_000) return json({ error: 'Canvas is too large to share' }, 413)
  const allowed = Object.fromEntries(Object.entries(snapshot).filter(([key, value]) => key.startsWith('fieldnotes:') && key !== 'fieldnotes:device-id' && typeof value === 'string'))
  const token = crypto.randomUUID()
  await env.SHARES.getByName(token).save(allowed)
  return json({ token })
}

async function readShare(url: URL, env: Env) {
  const token = url.pathname.slice('/api/shares/'.length)
  if (!/^[0-9a-f-]{36}$/.test(token)) return json({ error: 'Invalid share link' }, 400)
  const snapshot = await env.SHARES.getByName(token).load()
  return snapshot ? json({ snapshot }) : json({ error: 'Share not found' }, 404)
}

async function chat(request: Request, env: Env, actor: string) {
  if (!env.OPENROUTER_API_KEY) return json({ error: 'OpenRouter is not configured. Add OPENROUTER_API_KEY to .dev.vars.' }, 503)
  const aiLimit = await env.AI_RATE_LIMITER.limit({ key: actor })
  if (!aiLimit.success) return json({ error: 'Chat rate limit reached. Try again in a minute.' }, 429)
  const body = await readJson<{ messages?: IncomingMessage[]; canvasContext?: string }>(request)
  const messages = body.messages
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 30) return json({ error: 'Provide between 1 and 30 messages' }, 400)
  let total = 0
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return json({ error: 'Invalid message' }, 400)
    total += message.content.length
    if (!message.content.trim() || message.content.length > 8_000 || total > 32_000) return json({ error: 'Chat context is too large' }, 413)
  }
  const canvasContext = typeof body.canvasContext === 'string' ? body.canvasContext.slice(0, 20_000) : ''

  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      'x-title': env.APP_NAME,
      'http-referer': new URL(request.url).origin,
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      max_completion_tokens: 1200,
      messages: [
        { role: 'system', content: `You are a concise research partner. Help analyze the current canvas, clearly distinguish evidence from inference, and use Markdown.\n\nCurrent canvas context:\n${canvasContext}` },
        ...messages,
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!upstream.ok) {
    console.error(JSON.stringify({ event: 'openrouter_error', status: upstream.status }))
    return json({ error: upstream.status === 429 ? 'The model is busy. Try again shortly.' : 'The model request failed.' }, upstream.status === 429 ? 429 : 502)
  }
  const result = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = result.choices?.[0]?.message?.content
  if (typeof content !== 'string') return json({ error: 'The model returned an invalid response' }, 502)
  return json({ content })
}

async function signUpload(env: Env) {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    return json({ error: 'Cloudinary is not configured. Add its credentials to .dev.vars.' }, 503)
  }
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const folder = 'fieldnotes'
  const signature = await sha1(`folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`)
  return json({
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/auto/upload`,
    fields: { api_key: env.CLOUDINARY_API_KEY, timestamp, folder, signature },
  })
}

async function deleteMedia(request: Request, env: Env) {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return json({ error: 'Cloudinary is not configured' }, 503)
  const { id } = await readJson<{ id?: string }>(request)
  const separator = id?.indexOf(':') ?? -1
  if (!id || separator < 1) return json({ error: 'Invalid media identifier' }, 400)
  const resourceType = id.slice(0, separator)
  const publicId = id.slice(separator + 1)
  if (!['image', 'video', 'raw'].includes(resourceType) || !publicId || publicId.length > 500) return json({ error: 'Invalid media identifier' }, 400)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = await sha1(`public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`)
  const form = new FormData()
  form.set('public_id', publicId); form.set('timestamp', timestamp); form.set('api_key', env.CLOUDINARY_API_KEY); form.set('signature', signature)
  const upstream = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/${resourceType}/destroy`, { method: 'POST', body: form, signal: AbortSignal.timeout(15_000) })
  return upstream.ok ? json({ deleted: true }) : json({ error: 'Cloudinary could not remove the media' }, 502)
}

async function ingestLink(request: Request, ctx: ExecutionContext) {
  const { url: value } = await readJson<{ url?: string }>(request)
  if (!value || value.length > 2_048) return json({ error: 'Invalid URL' }, 400)
  const target = new URL(value)
  if (target.protocol !== 'https:' || isPrivateHost(target.hostname)) return json({ error: 'Only public HTTPS links are supported' }, 400)

  const cache = caches.default
  const cacheKey = new Request(`https://fieldnotes-cache.invalid/link?url=${encodeURIComponent(target.href)}`)
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  const upstream = await fetch(target, {
    headers: { accept: 'text/html, text/plain;q=0.9', 'user-agent': 'FieldnotesLinkReader/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12_000),
  })
  if (!upstream.ok) return json({ error: 'The link could not be read' }, 422)
  const type = upstream.headers.get('content-type') ?? ''
  if (!type.includes('text/html') && !type.includes('text/plain')) return json({ title: target.hostname, content: '', kind: /video/.test(type) ? 'video' : 'article' })
  const html = await readBoundedText(upstream, 1_000_000)
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || target.hostname).slice(0, 240)
  const description = decodeEntities(html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)/i)?.[1] || '')
  const content = htmlToMarkdown(html).slice(0, 100_000)
  const response = new Response(JSON.stringify({ title, description, content, kind: 'article', url: target.href }), {
    headers: { ...JSON_HEADERS, 'cache-control': 'public, max-age=86400' },
  })
  ctx.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}

async function readJson<T>(request: Request, maxBytes = MAX_JSON_BYTES): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > maxBytes) throw new Response('Payload too large', { status: 413 })
  const text = await readBoundedText(request, maxBytes)
  if (text.length > maxBytes) throw new Response('Payload too large', { status: 413 })
  try { return JSON.parse(text) as T } catch { throw new Response('Invalid JSON', { status: 400 }) }
}

async function sha1(value: string) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host === '0.0.0.0' || host === '::1'
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
}

async function readBoundedText(source: Request | Response, limit: number) {
  if (!source.body) return ''
  const reader = source.body.getReader()
  const decoder = new TextDecoder()
  let output = ''
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > limit) { await reader.cancel(); throw new Response('Payload too large', { status: 413 }) }
    output += decoder.decode(value, { stream: true })
  }
  return output + decoder.decode()
}

function htmlToMarkdown(html: string) {
  return decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|article|section)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim())
}

function decodeEntities(value: string) {
  return value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
}

function securityHeaders(request: Request) {
  return { 'access-control-allow-origin': new URL(request.url).origin, 'access-control-allow-headers': 'content-type,x-fieldnotes-device', 'access-control-allow-methods': 'GET,POST,OPTIONS' }
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS })
}
