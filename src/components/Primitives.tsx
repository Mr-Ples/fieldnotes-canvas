import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button aria-label={label} title={label} className={`icon-button ${className}`} {...props}>{children}</button>
}

export function TabButton({ active, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return <button role="tab" aria-selected={active} className={`tab-button ${active ? 'is-active' : ''}`} {...props}>{children}</button>
}

export function Avatar({ initials, color = 'sage' }: { initials: string; color?: 'sage' | 'clay' | 'ink' }) {
  return <span className={`avatar avatar-${color}`}>{initials}</span>
}

export function CopyLinkButton({ target }: { target: string }) {
  const copy = async () => {
    const url = new URL(window.location.href)
    url.hash = target
    await navigator.clipboard.writeText(url.toString())
  }
  return <button className="text-action" onClick={copy}>Copy link</button>
}
