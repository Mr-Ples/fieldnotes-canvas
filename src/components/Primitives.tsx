import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useState } from 'react'
import { Check } from 'lucide-react'
import { showToast } from './Popups'

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button aria-label={label} title={label} className={`icon-button ${className}`} {...props}>{children}</button>
}

export function TabButton({ active, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return <button role="tab" aria-selected={active} className={`tab-button ${active ? 'is-active' : ''}`} {...props}>{children}</button>
}

export function Avatar({ initials, color = 'sage', src, name }: { initials: string; color?: 'sage' | 'clay' | 'ink'; src?: string; name?: string }) {
  return src ? <img className="avatar object-cover" src={src} alt={name ? `${name}'s avatar` : ''}/> : <span className={`avatar avatar-${color}`}>{initials}</span>
}

export function CopyLinkButton({ target }: { target: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const url = new URL(window.location.href)
    url.hash = target
    await navigator.clipboard.writeText(url.toString())
    setCopied(true)
    showToast('Link copied')
    window.setTimeout(() => setCopied(false), 1400)
  }
  return <button type="button" className="text-action" onClick={() => void copy()} aria-label={copied ? 'Link copied' : 'Copy link'}>{copied ? <><Check size={12} /> Copied</> : 'Copy link'}</button>
}
