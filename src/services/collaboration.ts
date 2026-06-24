export type AccessMode = 'public' | 'login' | 'readonly'

export type CollaborationSettings = {
  canvas: AccessMode
  resources: AccessMode
  discussion: AccessMode
  llm: AccessMode
  chat: AccessMode
}

export const defaultCollaborationSettings: CollaborationSettings = {
  canvas: 'public',
  resources: 'public',
  discussion: 'public',
  llm: 'public',
  chat: 'public',
}

export function getCollaborationSettings(): CollaborationSettings {
  try {
    return { ...defaultCollaborationSettings, ...JSON.parse(localStorage.getItem('fieldnotes:collaboration-settings') ?? '{}') }
  } catch {
    return defaultCollaborationSettings
  }
}

export function saveCollaborationSettings(settings: CollaborationSettings) {
  localStorage.setItem('fieldnotes:collaboration-settings', JSON.stringify(settings))
  window.dispatchEvent(new CustomEvent('fieldnotes:collaboration-settings-changed', { detail: settings }))
}

export function isOwnerSessionActive() {
  return localStorage.getItem('fieldnotes:owner-signed-out') !== 'true'
}

export function setOwnerSessionActive(active: boolean) {
  if (active) localStorage.removeItem('fieldnotes:owner-signed-out')
  else localStorage.setItem('fieldnotes:owner-signed-out', 'true')
  window.dispatchEvent(new CustomEvent('fieldnotes:owner-session-changed', { detail: active }))
}
