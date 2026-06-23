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
  discordMessageId?: string
  discordChannelId?: string
  discordGuildId?: string
  createdAt: number
  editedAt?: number
  deleted: boolean
  syncStatus: 'local' | 'pending' | 'synced' | 'unlinked' | 'failed'
}

export type DiscordEvent = {
  type: 'MESSAGE_CREATE' | 'MESSAGE_UPDATE' | 'MESSAGE_DELETE'
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
      `)
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ connectedAt: Date.now() })
    server.send(JSON.stringify({ type: 'ready', messages: await this.listMessages(50) }))
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === 'string' && message === 'ping') ws.send('pong')
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason)
  }

  async listMessages(limit = 50, before?: number): Promise<ChatMessage[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100))
    const rows = before
      ? this.ctx.storage.sql.exec<MessageRow>('SELECT * FROM messages WHERE created_at < ? ORDER BY created_at DESC LIMIT ?', before, safeLimit).toArray()
      : this.ctx.storage.sql.exec<MessageRow>('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?', safeLimit).toArray()
    return rows.reverse().map(toMessage)
  }

  async postWebsite(input: { authorId: string; authorName: string; authorAvatar?: string; content: string; replyTo?: string }): Promise<ChatMessage> {
    const channel = await this.getDiscordChannel()
    const message: ChatMessage = {
      id: crypto.randomUUID(), origin: 'website', authorId: input.authorId, authorName: input.authorName,
      authorAvatar: input.authorAvatar, content: input.content, replyTo: input.replyTo, attachments: [],
      discordChannelId: channel?.channelId, discordGuildId: channel?.guildId, createdAt: Date.now(), deleted: false,
      syncStatus: channel ? 'pending' : 'unlinked',
    }
    this.insert(message)
    this.broadcast({ type: 'message', message })
    return message
  }

  async ingestDiscord(event: DiscordEvent): Promise<void> {
    if (event.type === 'MESSAGE_DELETE') {
      const row = this.ctx.storage.sql.exec<MessageRow>('UPDATE messages SET deleted = 1, content = ?, edited_at = ? WHERE discord_message_id = ? RETURNING *', '', Date.now(), event.messageId).toArray()[0]
      if (row) this.broadcast({ type: 'message', message: toMessage(row) })
      return
    }
    if (event.type === 'MESSAGE_UPDATE') {
      const row = this.ctx.storage.sql.exec<MessageRow>('UPDATE messages SET content = ?, edited_at = ? WHERE discord_message_id = ? RETURNING *', event.content ?? '', Date.now(), event.messageId).toArray()[0]
      if (row) this.broadcast({ type: 'message', message: toMessage(row) })
      return
    }
    const existing = this.ctx.storage.sql.exec<MessageRow>('SELECT * FROM messages WHERE discord_message_id = ?', event.messageId).toArray()[0]
    if (existing) return
    const reply = event.replyToDiscordId
      ? this.ctx.storage.sql.exec<{ id: string }>('SELECT id FROM messages WHERE discord_message_id = ?', event.replyToDiscordId).toArray()[0]?.id
      : undefined
    const message: ChatMessage = {
      id: crypto.randomUUID(), origin: 'discord', authorId: event.authorId ?? 'discord', authorName: event.authorName ?? 'Discord user',
      authorAvatar: event.authorAvatar, content: event.content ?? '', replyTo: reply, attachments: event.attachments ?? [],
      discordMessageId: event.messageId, discordChannelId: event.channelId, discordGuildId: event.guildId,
      createdAt: event.timestamp ?? Date.now(), deleted: false, syncStatus: 'synced',
    }
    this.insert(message)
    this.broadcast({ type: 'message', message })
  }

  async setDiscordChannel(channelId: string, guildId: string): Promise<void> {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO config(key, value) VALUES ('discord', ?)", JSON.stringify({ channelId, guildId }))
    this.broadcast({ type: 'linked', channelId, guildId })
  }

  async clearDiscordChannel(channelId: string): Promise<void> {
    const current = await this.getDiscordChannel()
    if (current?.channelId === channelId) this.ctx.storage.sql.exec("DELETE FROM config WHERE key = 'discord'")
  }

  async getDiscordChannel(): Promise<{ channelId: string; guildId: string } | null> {
    const value = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM config WHERE key = 'discord'").toArray()[0]?.value
    return value ? JSON.parse(value) as { channelId: string; guildId: string } : null
  }

  async markDelivered(id: string, discordMessageId: string): Promise<void> {
    const row = this.ctx.storage.sql.exec<MessageRow>("UPDATE messages SET discord_message_id = ?, sync_status = 'synced' WHERE id = ? RETURNING *", discordMessageId, id).toArray()[0]
    if (row) this.broadcast({ type: 'message', message: toMessage(row) })
  }

  async markFailed(id: string): Promise<void> {
    const row = this.ctx.storage.sql.exec<MessageRow>("UPDATE messages SET sync_status = 'failed' WHERE id = ? RETURNING *", id).toArray()[0]
    if (row) this.broadcast({ type: 'message', message: toMessage(row) })
  }

  private insert(message: ChatMessage) {
    this.ctx.storage.sql.exec(`INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      message.id, message.origin, message.authorId, message.authorName, message.authorAvatar ?? null, message.content,
      message.replyTo ?? null, JSON.stringify(message.attachments), message.discordMessageId ?? null, message.discordChannelId ?? null,
      message.discordGuildId ?? null, message.createdAt, message.editedAt ?? null, message.deleted ? 1 : 0, message.syncStatus)
  }

  private broadcast(payload: unknown) {
    const encoded = JSON.stringify(payload)
    for (const socket of this.ctx.getWebSockets()) {
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
}

type MessageRow = {
  id: string; origin: 'website' | 'discord'; author_id: string; author_name: string; author_avatar: string | null;
  content: string; reply_to: string | null; attachments: string; discord_message_id: string | null;
  discord_channel_id: string | null; discord_guild_id: string | null; created_at: number; edited_at: number | null;
  deleted: number; sync_status: ChatMessage['syncStatus']
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id, origin: row.origin, authorId: row.author_id, authorName: row.author_name,
    authorAvatar: row.author_avatar ?? undefined, content: row.content, replyTo: row.reply_to ?? undefined,
    attachments: JSON.parse(row.attachments) as ChatMessage['attachments'], discordMessageId: row.discord_message_id ?? undefined,
    discordChannelId: row.discord_channel_id ?? undefined, discordGuildId: row.discord_guild_id ?? undefined,
    createdAt: row.created_at, editedAt: row.edited_at ?? undefined, deleted: Boolean(row.deleted), syncStatus: row.sync_status,
  }
}
