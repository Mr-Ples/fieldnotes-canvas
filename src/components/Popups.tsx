import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, AlertTriangle, X } from 'lucide-react'

type ConfirmRequest = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
  resolve: (value: boolean) => void
}

type PromptRequest = {
  title: string
  message: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
  resolve: (value: string | null) => void
}

type Toast = {
  id: string
  title: string
  message?: string
}

const confirmEvent = 'fieldnotes:popup-confirm'
const promptEvent = 'fieldnotes:popup-prompt'
const toastEvent = 'fieldnotes:popup-toast'

export function showConfirm(request: Omit<ConfirmRequest, 'resolve'>) {
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent(confirmEvent, { detail: { ...request, resolve } }))
  })
}

export function showPrompt(request: Omit<PromptRequest, 'resolve'>) {
  return new Promise<string | null>((resolve) => {
    window.dispatchEvent(new CustomEvent(promptEvent, { detail: { ...request, resolve } }))
  })
}

export function showToast(title: string, message?: string) {
  window.dispatchEvent(new CustomEvent(toastEvent, { detail: { id: crypto.randomUUID(), title, message } satisfies Toast }))
}

export function PopupHost() {
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [prompt, setPrompt] = useState<PromptRequest | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const onConfirm = (event: Event) => {
      setPrompt(null)
      const detail = (event as CustomEvent<ConfirmRequest>).detail
      setConfirm(detail)
    }
    const onPrompt = (event: Event) => {
      setConfirm(null)
      const detail = (event as CustomEvent<PromptRequest>).detail
      setPrompt(detail)
      setPromptValue(detail.defaultValue ?? '')
    }
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<Toast>).detail
      setToasts((current) => [detail, ...current].slice(0, 4))
      window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== detail.id)), 2400)
    }
    window.addEventListener(confirmEvent, onConfirm)
    window.addEventListener(promptEvent, onPrompt)
    window.addEventListener(toastEvent, onToast)
    return () => {
      window.removeEventListener(confirmEvent, onConfirm)
      window.removeEventListener(promptEvent, onPrompt)
      window.removeEventListener(toastEvent, onToast)
    }
  }, [])

  useEffect(() => {
    if (!confirm && !prompt) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (confirm) { confirm.resolve(false); setConfirm(null) }
        if (prompt) { prompt.resolve(null); setPrompt(null) }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirm, prompt])

  const modal = useMemo(() => {
    if (confirm) {
      const accept = () => { confirm.resolve(true); setConfirm(null) }
      const cancel = () => { confirm.resolve(false); setConfirm(null) }
      return createPortal(<div className="popup-backdrop" role="presentation" onPointerDown={cancel}>
        <div className="popup-card" role="dialog" aria-modal="true" aria-label={confirm.title} onPointerDown={(event) => event.stopPropagation()}>
          <div className="popup-header">
            <span className={`popup-icon ${confirm.tone === 'danger' ? 'is-danger' : ''}`}>{confirm.tone === 'danger' ? <AlertTriangle size={15} /> : <Check size={15} />}</span>
            <button className="popup-close" onClick={cancel} aria-label="Close dialog"><X size={15} /></button>
          </div>
          <h2>{confirm.title}</h2>
          <p>{confirm.message}</p>
          <div className="popup-actions">
            <button className="popup-secondary" onClick={cancel}>{confirm.cancelLabel ?? 'Cancel'}</button>
            <button className={confirm.tone === 'danger' ? 'popup-danger' : 'popup-primary'} onClick={accept}>{confirm.confirmLabel ?? 'OK'}</button>
          </div>
        </div>
      </div>, document.body)
    }
    if (prompt) {
      const submit = () => { prompt.resolve(promptValue.trim() || null); setPrompt(null) }
      const cancel = () => { prompt.resolve(null); setPrompt(null) }
      return createPortal(<div className="popup-backdrop" role="presentation" onPointerDown={cancel}>
        <div className="popup-card" role="dialog" aria-modal="true" aria-label={prompt.title} onPointerDown={(event) => event.stopPropagation()}>
          <div className="popup-header">
            <span className="popup-icon"><Check size={15} /></span>
            <button className="popup-close" onClick={cancel} aria-label="Close dialog"><X size={15} /></button>
          </div>
          <h2>{prompt.title}</h2>
          <p>{prompt.message}</p>
          <input
            autoFocus
            className="popup-input"
            value={promptValue}
            onChange={(event) => setPromptValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
            placeholder={prompt.placeholder}
          />
          <div className="popup-actions">
            <button className="popup-secondary" onClick={cancel}>{prompt.cancelLabel ?? 'Cancel'}</button>
            <button className="popup-primary" onClick={submit}>{prompt.confirmLabel ?? 'Save'}</button>
          </div>
        </div>
      </div>, document.body)
    }
    return null
  }, [confirm, prompt, promptValue])

  return <>
    {modal}
    {createPortal(<div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div key={toast.id} className="toast"><strong>{toast.title}</strong>{toast.message && <span>{toast.message}</span>}</div>)}</div>, document.body)}
  </>
}
