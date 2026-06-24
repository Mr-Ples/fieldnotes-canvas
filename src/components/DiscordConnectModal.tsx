import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ExternalLink, Hash, LoaderCircle, Server, X } from 'lucide-react'

type Guild = { id: string; name: string; icon?: string | null }
type Channel = { id: string; name: string; type: number; parentId?: string | null }

export default function DiscordConnectModal({ canvasId, open, onClose, onLinked }: { canvasId: string; open: boolean; onClose: () => void; onLinked: () => void }) {
  const [session, setSession] = useState(() => new URL(window.location.href).searchParams.get('discordConnect'))
  const [guilds, setGuilds] = useState<Guild[]>([])
  const [guild, setGuild] = useState<Guild>()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const authWindow = useRef<Window | null>(null)

  useEffect(() => {
    const receiveOAuth = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || (authWindow.current && event.source !== authWindow.current)) return
      const payload = event.data as { type?: string; session?: string; canvasId?: string } | null
      if (payload?.type !== 'fieldnotes:discord-oauth-complete' || payload.canvasId !== canvasId || !payload.session) return
      authWindow.current = null
      setSession(payload.session)
      setError('')
    }
    window.addEventListener('message', receiveOAuth)
    return () => window.removeEventListener('message', receiveOAuth)
  }, [canvasId])

  const startOAuth = () => {
    setError('')
    const opened = window.open(`/api/discord/connect?canvasId=${encodeURIComponent(canvasId)}`, 'fieldnotes-discord-oauth')
    if (!opened) {
      setError('Your browser blocked the Discord authorization tab. Allow pop-ups for this site and try again.')
      return
    }
    authWindow.current = opened
    opened.focus()
  }

  useEffect(() => {
    if (!open || !session) return
    setLoading(true); setError('')
    void fetch(`/api/discord/connect/session?session=${encodeURIComponent(session)}`).then(async (response) => {
      const result = await response.json() as { guilds?: Guild[]; error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Discord connection expired')
      setGuilds(result.guilds ?? [])
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load Discord servers')).finally(() => setLoading(false))
  }, [open, session])

  const selectGuild = async (selected: Guild) => {
    if (!session) return
    setGuild(selected); setChannels([]); setInviteUrl(''); setLoading(true); setError('')
    try {
      const response = await fetch(`/api/discord/connect/guilds/${selected.id}/channels?session=${encodeURIComponent(session)}`)
      const result = await response.json() as { channels?: Channel[]; inviteUrl?: string; botMissing?: boolean; error?: string }
      setInviteUrl(result.inviteUrl ?? '')
      if (result.botMissing) throw new Error('The Fieldnotes bot is not installed in this server yet.')
      if (!response.ok) throw new Error(result.error ?? 'Could not load channels')
      setChannels(result.channels ?? [])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load channels') }
    finally { setLoading(false) }
  }

  const link = async (channel: Channel) => {
    if (!session || !guild) return
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/discord/connect/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session, canvasId, guildId: guild.id, channelId: channel.id, channelName: channel.name }) })
      const result = await response.json() as { error?: string; inviteUrl?: string; needsBotAuthorization?: boolean }
      if (result.inviteUrl) setInviteUrl(result.inviteUrl)
      if (!response.ok) throw new Error(result.error ?? 'Could not link channel')
      const url = new URL(window.location.href); url.searchParams.delete('discordConnect'); url.searchParams.delete('canvas'); window.history.replaceState({}, '', url)
      onLinked(); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not link channel') }
    finally { setLoading(false) }
  }

  if (!open) return null
  return <div className="fixed inset-0 z-[200] grid place-items-center bg-ink/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Connect Discord">
    <div className="w-full max-w-md overflow-hidden rounded-2xl bg-paper shadow-2xl">
      <header className="flex items-center gap-2 border-b border-rule px-5 py-4">
        {guild && <button className="icon-button" onClick={() => { setGuild(undefined); setChannels([]); setError('') }} aria-label="Back"><ArrowLeft size={17}/></button>}
        <div className="flex-1"><h2 className="m-0 font-serif text-xl font-semibold">{guild ? `Choose a channel in ${guild.name}` : 'Connect Discord'}</h2><p className="m-0 mt-1 text-[10px] text-stone-500">{guild ? 'Messages will synchronize in both directions.' : 'Choose a server you manage.'}</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button>
      </header>
      <div className="max-h-[60vh] overflow-y-auto p-3">
        {!session && <><button className="flex w-full items-center justify-center gap-2 rounded-lg border-0 bg-indigo-600 px-4 py-3 text-xs font-semibold text-white" onClick={startOAuth}><ExternalLink size={15}/> Continue with Discord</button><p className="mx-2 mt-3 text-center text-[10px] leading-relaxed text-stone-500">Discord authorization opens in a separate browser tab. Discord requires OAuth sign-in on the web; it cannot be completed inside the desktop app.</p></>}
        {loading && <div className="flex items-center justify-center gap-2 py-10 text-xs text-stone-500"><LoaderCircle className="animate-spin" size={17}/> Loading Discord…</div>}
        {error && !loading && <div className="m-1 rounded-lg bg-red-50 p-3 text-[11px] text-red-800"><p className="m-0">{error}</p>{inviteUrl && <div className="mt-3 flex gap-2"><a className="rounded-md bg-indigo-600 px-3 py-2 font-semibold text-white no-underline" href={inviteUrl} target="_blank" rel="noreferrer">Authorize bot permissions</a><button className="rounded-md border border-red-200 bg-white px-3 py-2" onClick={() => guild && void selectGuild(guild)}>Retry</button></div>}</div>}
        {!guild && !loading && session && guilds.map((item) => <button key={item.id} className="flex w-full items-center gap-3 rounded-lg border-0 bg-transparent p-3 text-left hover:bg-stone-100" onClick={() => void selectGuild(item)}>{item.icon ? <img className="size-9 rounded-xl" alt="" src={`https://cdn.discordapp.com/icons/${item.id}/${item.icon}.png?size=80`}/> : <span className="grid size-9 place-items-center rounded-xl bg-indigo-100 text-indigo-700"><Server size={17}/></span>}<span className="flex-1 truncate text-xs font-semibold">{item.name}</span></button>)}
        {guild && !loading && channels.map((channel) => <button key={channel.id} className="group flex w-full items-center gap-3 rounded-lg border-0 bg-transparent p-3 text-left hover:bg-stone-100" onClick={() => void link(channel)}><span className="grid size-8 place-items-center rounded-lg bg-stone-100 text-stone-500"><Hash size={15}/></span><span className="flex-1 truncate text-xs">{channel.name}</span>{channel.type >= 10 && <span className="text-[8px] font-bold text-stone-400">THREAD</span>}<Check className="text-emerald-700 opacity-0 group-hover:opacity-100" size={14}/></button>)}
        {guild && !loading && inviteUrl && <a className="mx-3 mt-2 block text-center text-[9px] text-indigo-700" href={inviteUrl} target="_blank" rel="noreferrer">Update bot permissions</a>}
        {guild && !loading && !error && channels.length === 0 && <p className="p-5 text-center text-xs text-stone-500">The bot cannot access any supported text channels or active threads in this server.</p>}
        {!guild && !loading && session && !error && guilds.length === 0 && <p className="p-5 text-center text-xs text-stone-500">No manageable Discord servers were found.</p>}
      </div>
    </div>
  </div>
}
