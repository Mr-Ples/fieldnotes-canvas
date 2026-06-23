import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import {
  Client, Events, GatewayIntentBits, Partials, PermissionFlagsBits, SlashCommandBuilder,
  type Message, type PartialMessage,
} from 'discord.js'

// Node does not understand Wrangler's .dev.vars convention. Load the bridge
// file first, then fill any missing local values from the repository root.
loadEnv({ path: fileURLToPath(new URL('../.env', import.meta.url)) })
loadEnv({ path: fileURLToPath(new URL('../../../.dev.vars', import.meta.url)) })

const token = required('DISCORD_BOT_TOKEN')
const apiUrl = (process.env.FIELDNOTES_API_URL || 'http://localhost:5173').replace(/\/$/, '')
const secret = process.env.FIELDNOTES_BRIDGE_SECRET || required('DISCORD_BRIDGE_SECRET')
const port = Number(process.env.PORT ?? 8080)
let lastGatewayMessage: { messageId: string; channelId: string; at: string } | null = null
let lastForward: { messageId: string; result?: unknown; error?: string; at: string } | null = null

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message],
})

client.once(Events.ClientReady, async (ready) => {
  await ready.application.commands.create(new SlashCommandBuilder()
    .setName('canvas-link')
    .setDescription('Link this Discord channel or thread to a Fieldnotes canvas')
    .addStringOption((option) => option.setName('canvas-id').setDescription('The canvas ID shown in Fieldnotes').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels))
  console.log(JSON.stringify({ event: 'discord_ready', user: ready.user.tag }))
})

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'canvas-link' || !interaction.guildId || !interaction.channelId) return
  await interaction.deferReply({ ephemeral: true })
  try {
    await post('/api/internal/discord/link', {
      canvasId: interaction.options.getString('canvas-id', true), channelId: interaction.channelId, guildId: interaction.guildId,
    })
    await interaction.editReply('This channel is now synchronized with the canvas.')
  } catch (error) {
    console.error(JSON.stringify({ event: 'canvas_link_failed', error: error instanceof Error ? error.message : 'Unknown error' }))
    await interaction.editReply('The channel could not be linked. Check the bridge configuration.')
  }
})

client.on(Events.MessageCreate, async (message) => {
  if (!message.guildId || message.author.bot || message.webhookId) return
  lastGatewayMessage = { messageId: message.id, channelId: message.channelId, at: new Date().toISOString() }
  await sendMessageEvent('MESSAGE_CREATE', message)
})

client.on(Events.Error, (error) => console.error(JSON.stringify({ event: 'discord_gateway_error', error: error.message })))
client.on(Events.Warn, (warning) => console.warn(JSON.stringify({ event: 'discord_gateway_warning', warning })))

client.on(Events.MessageUpdate, async (_oldMessage, message) => {
  if (!message.guildId || message.author?.bot || message.webhookId) return
  if (message.partial) await message.fetch()
  await sendMessageEvent('MESSAGE_UPDATE', message)
})

client.on(Events.MessageDelete, async (message) => {
  if (!message.guildId) return
  await sendMessageEvent('MESSAGE_DELETE', message)
})

async function sendMessageEvent(type: 'MESSAGE_CREATE' | 'MESSAGE_UPDATE' | 'MESSAGE_DELETE', message: Message | PartialMessage) {
  try {
    const result = await post('/api/internal/discord/events', {
      type, messageId: message.id, channelId: message.channelId, guildId: message.guildId,
      authorId: message.author?.id, authorName: message.member?.displayName ?? message.author?.globalName ?? message.author?.username,
      authorAvatar: message.author?.displayAvatarURL({ size: 128 }), content: message.content,
      replyToDiscordId: message.reference?.messageId,
      attachments: [...message.attachments.values()].map((attachment) => ({ id: attachment.id, name: attachment.name, url: attachment.url, contentType: attachment.contentType ?? undefined })),
      timestamp: message.createdTimestamp || Date.now(),
    })
    lastForward = { messageId: message.id, result, at: new Date().toISOString() }
    console.log(JSON.stringify({ event: 'discord_event_forwarded', type, messageId: message.id, channelId: message.channelId, result }))
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error'
    lastForward = { messageId: message.id, error: detail, at: new Date().toISOString() }
    console.error(JSON.stringify({ event: 'discord_event_failed', type, messageId: message.id, error: detail }))
  }
}

async function post(path: string, value: unknown) {
  const body = JSON.stringify(value)
  const timestamp = Date.now().toString()
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST', body, signal: AbortSignal.timeout(15_000),
    headers: { 'content-type': 'application/json', 'x-fieldnotes-timestamp': timestamp, 'x-fieldnotes-signature': signature },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Fieldnotes returned ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`)
  try { return JSON.parse(text) as unknown }
  catch { return text || null }
}

createServer((_request, response) => {
  response.writeHead(client.isReady() ? 200 : 503, { 'content-type': 'application/json' })
  response.end(JSON.stringify({
    ok: client.isReady(),
    bot: client.user?.tag ?? null,
    guildCount: client.guilds.cache.size,
    lastGatewayMessage,
    lastForward,
  }))
}).listen(port)

client.login(token).catch((error) => {
  console.error(JSON.stringify({ event: 'discord_login_failed', error: error instanceof Error ? error.message : 'Unknown error' }))
  process.exit(1)
})

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}
