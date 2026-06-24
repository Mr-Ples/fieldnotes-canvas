import { useEffect, useRef, useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { showConfirm, showToast } from './Popups'
import { setOwnerSessionActive } from '../services/collaboration'

export type DiscordUser = { id: string; displayName: string; username: string; avatar?: string }

export default function DiscordIdentity({ compact = false, onChange }: { compact?: boolean; onChange?: (user: DiscordUser | null) => void }) {
  const [user, setUser] = useState<DiscordUser | null>(null)
  const [loading, setLoading] = useState(true)
  const authWindow = useRef<Window | null>(null)

  const refresh = async () => {
    try {
      const response = await fetch('/api/discord/me')
      const result = await response.json() as { user?: DiscordUser | null }
      const next = response.ok ? result.user ?? null : null
      if (next) setOwnerSessionActive(true)
      setUser(next)
      onChange?.(next)
      return next
    } catch {
      setUser(null)
      onChange?.(null)
      return null
    } finally { setLoading(false) }
  }

  useEffect(() => {
    void refresh()
    const syncIdentity = (event: Event) => {
      const next = (event as CustomEvent<DiscordUser | null>).detail
      setUser(next)
      onChange?.(next)
      setLoading(false)
    }
    const receiveOAuth = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== authWindow.current) return
      const payload = event.data as { type?: string } | null
      if (payload?.type !== 'fieldnotes:discord-auth-complete') return
      authWindow.current = null
      setOwnerSessionActive(true)
      void refresh().then((next) => window.dispatchEvent(new CustomEvent('fieldnotes:discord-auth-synced', { detail: next ?? null })))
    }
    window.addEventListener('fieldnotes:discord-auth-synced', syncIdentity)
    window.addEventListener('message', receiveOAuth)
    return () => {
      window.removeEventListener('message', receiveOAuth)
      window.removeEventListener('fieldnotes:discord-auth-synced', syncIdentity)
    }
  }, [])

  const signIn = () => {
    const opened = window.open('/api/discord/auth', 'fieldnotes-discord-auth', 'popup,width=520,height=720')
    if (!opened) { window.location.assign('/api/discord/auth'); return }
    authWindow.current = opened
    opened.focus()
  }

  const signOut = () => signOutDiscord()

  if (loading) return compact ? null : <span className="text-[9px] text-stone-400">Checking identity…</span>
  if (!user) return <button className="discord-signin" onClick={signIn}><LogIn size={13}/> Sign in with Discord</button>
  return <div className={`discord-identity ${compact ? 'is-compact' : ''}`}>
    {user.avatar ? <img src={user.avatar} alt=""/> : <span>{user.displayName.slice(0, 2).toUpperCase()}</span>}
    <strong>{user.displayName}</strong>
    {!compact && <button onClick={() => void signOut()} aria-label="Sign out of Discord" title="Sign out"><LogOut size={12}/></button>}
  </div>
}

export async function signOutDiscord() {
    if (!await showConfirm({
      title: 'Sign out of Discord?',
      message: 'You will also stop acting as this canvas admin until you sign in again.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Keep me signed in',
      tone: 'danger',
    })) return
    await fetch('/api/discord/logout', { method: 'POST' })
    setOwnerSessionActive(false)
    window.dispatchEvent(new CustomEvent('fieldnotes:discord-auth-synced', { detail: null }))
    showToast('Signed out')
}
