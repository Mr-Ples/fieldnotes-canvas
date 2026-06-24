import { DurableObject } from 'cloudflare:workers'

export type ChatMessage = {
  id: string
  origin: 'website' | 'discord'
  authorId: string
  authorName: string
  authorAvatar?: string
  content: string
  replyTo?: string
  attachments: Array<{ id: string; name: string; url: string; contentType?: string }>
  reactions: Array<{ emoji: string; count: number; participants: string[] }>
  discordMessageId?: string
  discordChannelId?: string
  discordGuildId?: string
  createdAt: number
  editedAt?: number
  deleted: boolean
  syncStatus: 'local' | 'pending' | 'synced' | 'unlinked' | 'failed'
}

export type DiscordEvent = {
  type: 'MESSAGE_CREATE' | 'MESSAGE_UPDATE' | 'MESSAGE_DELETE' | 'REACTION_ADD' | 'REACTION_REMOVE' | 'TYPING_START'
  messageId: string
  channelId: string
  guildId?: string
  authorId?: string
  authorName?: string
  authorAvatar?: string
  content?: string
  replyToDiscordId?: string
  attachments?: ChatMessage['attachments']
  timestamp?: number
  emoji?: string
  userId?: string
  userName?: string
}

export class CanvasRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          origin TEXT NOT NULL,
          author_id TEXT NOT NULL,
          author_name TEXT NOT NULL,
          author_avatar TEXT,
          content TEXT NOT NULL,
          reply_to TEXT,
          attachments TEXT NOT NULL DEFAULT '[]',
          discord_message_id TEXT UNIQUE,
          discord_channel_id TEXT,
          discord_guild_id TEXT,
          created_at INTEGER NOT NULL,
          edited_at INTEGER,
          deleted INTEGER NOT NULL DEFAULT 0,
          sync_status TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS messages_created_at ON messages(created_at DESC);
        CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS reactions (
          message_id TEXT NOT NULL,
          emoji TEXT NOT NULL,
          user_id TEXT NOT NULL,
          user_name TEXT,
          PRIMARY KEY (message_id, emoji, user_id)
        );
      `)
      const reactionColumns = this.ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(reactions)').toArray()
      if (!reactionColumns.some((column) => column.name === 'user_name')) this.ctx.storage.sql.exec('ALTER TABLE reactions ADD COLUMN user_name TEXT')
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({
      connectedAt: Date.now(),
      authorId: request.headers.get('x-fieldnotes-author-id') ?? 'website',
      authorName: decodeURIComponent(request.headers.get('x-fieldnotes-author-name') ?? 'Someone'),
      guest: request.headers.get('x-fieldnotes-guest') === 'true',
    })
    server.send(JSON.stringify({ type: 'ready', messages: await this.listMessages(50) }))
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return
    if (message === 'ping') { ws.send('pong'); return }
    try {
      const payload = JSON.parse(message) as { type?: string; guestName?: string }
      if (payload.type !== 'typing') return
      const attachment = ws.deserializeAttachment() as { authorId?: string; authorName?: string; guest?: boolean } | null
      const authorName = attachment?.guest ? safeGuestName(payload.guestName, attachment.authorName) : attachment?.authorName ?? 'Someone'
      this.broadcast({ type: 'typing', userId: attachment?.authorId ?? 'website', authorName }, ws)
      const channel = await this.getDiscordChannel()
      if (channel) await this.env.DISCORD_OUTBOUND.send({ type: 'typing', channelId: channel.channelId })
    } catch { /* Ignore malformed client events. */ }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason)
  }

  async listMessages(limit = 50, before?: number): Promise<ChatMessage[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100))
    const rows = before
      ? this.ctx.storage.sql.exec<MessageRow>('SELECT * FROM messages WHERE created_at < ? ORDER BY created_at DESC LIMIT ?', before, safeLimit).toArray()
      : this.ctx.storage.sql.exec<MessageRow>('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?', safeLimit).toArray()
    return rows.reverse().map((row) => toMessage(row, this.reactionsFor(row.id)))
  }

  async postWebsite(input: { authorId: string; authorName: string; authorAvatar?: string; content: string; replyTo?: string; attachments?: ChatMessage['attachments'] }): Promise<ChatMessage> {
    const channel = await this.getDiscordChannel()
    const message: ChatMessage = {
      id: crypto.randomUUID(), origin: 'website', authorId: input.authorId, authorName: input.authorName,
      authorAvatar: input.authorAvatar, content: input.content, replyTo: input.replyTo, attachments: input.attachments ?? [], reactions: [],
      discordChannelId: channel?.channelId, discordGuildId: channel?.guildId, createdAt: Date.now(), deleted: false,
      syncStatus: channel ? 'pending' : 'unlinked',
    }
    this.insert(message)
    this.broadcast({ type: 'message', message })
    return message
  }

  async ingestDiscord(event: DiscordEvent): Promise<void> {
    if (event.type === 'TYPING_START') {
      this.broadcast({ type: 'typing', userId: event.userId ?? 'discord', authorName: event.userName ?? 'Someone' })
      return
    }
    if (event.type === 'REACTION_ADD' || event.type === 'REACTION_REMOVE') {
      if (!event.emoji || !event.userId) return
      const emoji = normalizeEmoji(event.emoji)
      const row = this.ctx.storage.sql.exec<MessageRow>('SELECT * FROM messages WHERE discord_message_id = ?', event.messageId).toArray()[0]
      if (!row) return
      if (event.type === 'REACTION_ADD') this.ctx.storage.sql.exec('INSERT OR REPLACE INTO reactions(message_id, emoji, user_id, user_name) VALUES (?, ?, ?, ?)', row.id, emoji, event.userId, event.userName ?? 'Discord user')
      else {
        this.ctx.storage.sql.exec('DELETE FROM reactions WHERE message_id = ? AND emoji = ? AND user_id = ?', row.id, emoji, event.userId)
        if (emoji !== event.emoji) this.ctx.storage.sql.exec('DELETE FROM reactions WHERE message_id = ? AND emoji = ? AND user_id = ?', row.id, event.emoji, event.userId)
      }
      this.broadcast({ type: 'message', message: toMessage(row, this.reactionsFor(row.id)) })
      return
    }
    if (event.type === 'MESSAGE_DELETE') {
      const row = this.ctx.storage.sql.exec<MessageRow>('UPDATE messages SET deleted = 1, content = ?, edited_at = ? WHERE discord_message_id = ? RETURNING *', '', Date.now(), event.messageId).toArray()[0]
      if (row) this.broadcast({ type: 'message', message: toMessage(row, this.reactionsFor(row.id)) })
      return
    }
    if (event.type === 'MESSAGE_UPDATE') {
      const row = this.ctx.storage.sql.exec<MessageRow>('UPDATE messages SET content = ?, edited_at = ? WHERE discord_message_id = ? RETURNING *', event.content ?? '', Date.now(), event.messageId).toArray()[0]
      if (row) this.broadcast({ type: 'message', message: toMessage(row, this.reactionsFor(row.id)) })
      return
    }
    const existing = this.ctx.storage.sql.exec<MessageRow>('SELECT * FROM messages WHERE discord_message_id = ?', event.messageId).toArray()[0]
    if (existing) return
    const reply = event.replyToDiscordId
      ? this.ctx.storage.sql.exec<{ id: string }>('SELECT id FROM messages WHERE discord_message_id = ?', event.replyToDiscordId).toArray()[0]?.id
      : undefined
    const message: ChatMessage = {
      id: crypto.randomUUID(), origin: 'discord', authorId: event.authorId ?? 'discord', authorName: event.authorName ?? 'Discord user',
      authorAvatar: event.authorAvatar, content: event.content ?? '', replyTo: reply, attachments: event.attachments ?? [], reactions: [],
      discordMessageId: event.messageId, discordChannelId: event.channelId, discordGuildId: event.guildId,
      createdAt: event.timestamp ?? Date.now(), deleted: false, syncStatus: 'synced',
    }
    this.insert(message)
    this.broadcast({ type: 'message', message })
  }

  async setDiscordChannel(channelId: string, guildId: string, inviteUrl?: string): Promise<void> {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO config(key, value) VALUES ('discord', ?)", JSON.stringify({ channelId, guildId, inviteUrl }))
    this.broadcast({ type: 'linked', channelId, guildId })
  }

  async clearDiscordChannel(channelId: string): Promise<void> {
    const current = await this.getDiscordChannel()
    if (current?.channelId === channelId) this.ctx.storage.sql.exec("DELETE FROM config WHERE key = 'discord'")
  }

  async getDiscordChannel(): Promise<{ channelId: string; guildId: string; inviteUrl?: string } | null> {
    const value = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM config WHERE key = 'discord'").toArray()[0]?.value
    return value ? JSON.parse(value) as { channelId: string; guildId: string; inviteUrl?: string } : null
  }

  async markDelivered(id: string, discordMessageId: string): Promise<void> {
    const row = this.ctx.storage.sql.exec<MessageRow>("UPDATE messages SET discord_message_id = ?, sync_status = 'synced' WHERE id = ? RETURNING *", discordMessageId, id).toArray()[0]
    if (row) this.broadcast({ type: 'message', message: toMessage(row, this.reactionsFor(row.id)) })
  }

  async markFailed(id: string): Promise<void> {
    const row = this.ctx.storage.sql.exec<MessageRow>("UPDATE messages SET sync_status = 'failed' WHERE id = ? RETURNING *", id).toArray()[0]
    if (row) this.broadcast({ type: 'message', message: toMessage(row, this.reactionsFor(row.id)) })
  }

  async toggleWebsiteReaction(messageId: string, emoji: string, userId: string, userName: string): Promise<{ message: ChatMessage; active: boolean } | null> {
    const row = this.ctx.storage.sql.exec<MessageRow>('SELECT * FROM messages WHERE id = ?', messageId).toArray()[0]
    if (!row) return null
    const active = !this.ctx.storage.sql.exec<{ found: number }>('SELECT 1 AS found FROM reactions WHERE message_id = ? AND emoji = ? AND user_id = ?', messageId, emoji, userId).toArray()[0]
    if (active) this.ctx.storage.sql.exec('INSERT OR REPLACE INTO reactions(message_id, emoji, user_id, user_name) VALUES (?, ?, ?, ?)', messageId, emoji, userId, userName)
    else this.ctx.storage.sql.exec('DELETE FROM reactions WHERE message_id = ? AND emoji = ? AND user_id = ?', messageId, emoji, userId)
    const message = toMessage(row, this.reactionsFor(messageId))
    this.broadcast({ type: 'message', message })
    return { message, active }
  }

  private reactionsFor(messageId: string) {
    const rows = this.ctx.storage.sql.exec<{ emoji: string; user_id: string; user_name: string | null }>('SELECT emoji, user_id, user_name FROM reactions WHERE message_id = ?', messageId).toArray()
    const users = new Map<string, Map<string, string>>()
    for (const row of rows) {
      const emoji = normalizeEmoji(row.emoji)
      const reacting = users.get(emoji) ?? new Map<string, string>()
      reacting.set(row.user_id, row.user_name ?? 'Unknown user')
      users.set(emoji, reacting)
    }
    return [...users].map(([emoji, reacting]) => ({ emoji, count: reacting.size, participants: [...reacting.values()] }))
  }

  private insert(message: ChatMessage) {
    this.ctx.storage.sql.exec(`INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      message.id, message.origin, message.authorId, message.authorName, message.authorAvatar ?? null, message.content,
      message.replyTo ?? null, JSON.stringify(message.attachments), message.discordMessageId ?? null, message.discordChannelId ?? null,
      message.discordGuildId ?? null, message.createdAt, message.editedAt ?? null, message.deleted ? 1 : 0, message.syncStatus)
  }

  private broadcast(payload: unknown, except?: WebSocket) {
    const encoded = JSON.stringify(payload)
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue
      try { socket.send(encoded) } catch { socket.close(1011, 'Delivery failed') }
    }
  }
}

export class DiscordChannelLink extends DurableObject<Env> {
  async setCanvas(canvasId: string) { await this.ctx.storage.put('canvasId', canvasId) }
  async getCanvas() { return await this.ctx.storage.get<string>('canvasId') ?? null }
  async clearCanvas(canvasId: string) {
    if (await this.getCanvas() === canvasId) await this.ctx.storage.delete('canvasId')
  }
  async getWebhook() { return await this.ctx.storage.get<{ id: string; token: string; threadId?: string }>('webhook') ?? null }
  async setWebhook(webhook: { id: string; token: string; threadId?: string }) { await this.ctx.storage.put('webhook', webhook) }
  async clearWebhook() { await this.ctx.storage.delete('webhook') }
}

export type DiscordGuild = { id: string; name: string; icon?: string | null; owner: boolean; permissions: string }
export type DiscordUser = { id: string; username: string; displayName: string; avatar?: string }
export class DiscordOAuthSession extends DurableObject<Env> {
  private static readonly SESSION_KEYS = ['canvasId', 'expiresAt', 'user', 'guilds']

  async start(canvasId?: string) {
    const pending: Record<string, string | number> = { expiresAt: Date.now() + 15 * 60_000 }
    if (canvasId) pending.canvasId = canvasId
    await this.ctx.storage.put(pending)
    await this.ctx.storage.setAlarm(Date.now() + 15 * 60_000)
  }
  async complete(user: DiscordUser, guilds: DiscordGuild[]) {
    const expiresAt = Date.now() + 30 * 24 * 60 * 60_000
    await this.ctx.storage.put({ user, guilds, expiresAt })
    await this.ctx.storage.setAlarm(expiresAt)
  }
  async getSession() {
    const data = await this.ctx.storage.get(DiscordOAuthSession.SESSION_KEYS)
    const expiresAt = data.get('expiresAt') as number | undefined
    if (!expiresAt || expiresAt < Date.now()) return null
    return { canvasId: data.get('canvasId') as string | undefined, user: data.get('user') as DiscordUser | undefined, guilds: (data.get('guilds') as DiscordGuild[] | undefined) ?? [], expiresAt }
  }
  async destroy() { await this.ctx.storage.delete(DiscordOAuthSession.SESSION_KEYS) }
  async alarm() {
    // Avoid deleteAll() here: local workerd can contend on its SQLite-wide
    // deletion path while an alarm output gate is committing.
    await this.ctx.storage.delete(DiscordOAuthSession.SESSION_KEYS)
  }
}

type MessageRow = {
  id: string; origin: 'website' | 'discord'; author_id: string; author_name: string; author_avatar: string | null;
  content: string; reply_to: string | null; attachments: string; discord_message_id: string | null;
  discord_channel_id: string | null; discord_guild_id: string | null; created_at: number; edited_at: number | null;
  deleted: number; sync_status: ChatMessage['syncStatus']
}

function toMessage(row: MessageRow, reactions: ChatMessage['reactions'] = []): ChatMessage {
  return {
    id: row.id, origin: row.origin, authorId: row.author_id, authorName: row.author_name,
    authorAvatar: row.author_avatar ?? undefined, content: row.content, replyTo: row.reply_to ?? undefined,
    attachments: JSON.parse(row.attachments) as ChatMessage['attachments'], reactions, discordMessageId: row.discord_message_id ?? undefined,
    discordChannelId: row.discord_channel_id ?? undefined, discordGuildId: row.discord_guild_id ?? undefined,
    createdAt: row.created_at, editedAt: row.edited_at ?? undefined, deleted: Boolean(row.deleted), syncStatus: row.sync_status,
  }
}

function normalizeEmoji(emoji: string) {
  try { return decodeURIComponent(emoji) }
  catch { return emoji }
}

function safeGuestName(value: string | undefined, fallback = 'Guest') {
  const cleaned = value?.trim().replace(/[@*_~<>]/g, '').slice(0, 32)
  return cleaned || fallback
}
