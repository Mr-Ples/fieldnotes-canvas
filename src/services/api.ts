export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }

export function getDeviceId() {
  const key = 'fieldnotes:device-id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

export function getGuestName() {
  return localStorage.getItem('fieldnotes:guest-name') || `Guest-${getDeviceId().replaceAll('-', '').slice(0, 6).toUpperCase()}`
}

export function setGuestName(name: string) {
  const cleaned = name.trim().replace(/[@*_~<>]/g, '').slice(0, 32)
  if (cleaned) localStorage.setItem('fieldnotes:guest-name', cleaned)
  else localStorage.removeItem('fieldnotes:guest-name')
  return getGuestName()
}

export function getOwnerToken() {
  const key = 'fieldnotes:owner-token'
  let token = localStorage.getItem(key)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(key, token)
  }
  return token
}

export async function completeChat(messages: ChatMessage[], signal?: AbortSignal) {
  const active = JSON.parse(localStorage.getItem('fieldnotes:active-canvas') ?? '{"id":"attention","title":"Designing for attention"}') as { id: string; title: string }
  const noteHtml = localStorage.getItem(`fieldnotes:notes-html:${active.id}`) ?? ''
  const canvasContext = `${active.title}\n\n${noteHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 20_000)}`
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-fieldnotes-device': getDeviceId() },
    body: JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })), canvasContext }),
    signal,
  })
  const data = await response.json() as { content?: string; error?: string }
  if (!response.ok) throw new Error(data.error ?? 'Chat request failed')
  return data.content ?? ''
}
