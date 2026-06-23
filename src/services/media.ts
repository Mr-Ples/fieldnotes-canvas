export type MediaKind = 'image' | 'video' | 'document' | 'audio' | 'other'

export interface StoredMedia {
  id: string
  url: string
  kind: MediaKind
  name: string
  bytes?: number
  metadata?: Record<string, string | number | boolean>
}

export interface UploadProgress {
  loaded: number
  total: number
}

/** Provider-neutral boundary. Keep signed upload creation on the server. */
export interface MediaStorage {
  upload(file: File, onProgress?: (progress: UploadProgress) => void): Promise<StoredMedia>
  remove(id: string): Promise<void>
  getDeliveryUrl(id: string, options?: { width?: number; format?: string }): string
}

/** The browser only requests a short-lived signature; Cloudinary credentials never ship here. */
export class CloudinaryMediaStorage implements MediaStorage {
  constructor(private readonly signatureEndpoint = '/api/media/sign') {}

  async upload(file: File, onProgress?: (progress: UploadProgress) => void): Promise<StoredMedia> {
    const signatureResponse = await fetch(this.signatureEndpoint, { method: 'POST' })
    if (!signatureResponse.ok) throw new Error('Could not prepare upload')
    const { uploadUrl, fields } = (await signatureResponse.json()) as {
      uploadUrl: string
      fields: Record<string, string>
    }
    const form = new FormData()
    Object.entries(fields).forEach(([key, value]) => form.append(key, value))
    form.append('file', file)

    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open('POST', uploadUrl)
      request.upload.onprogress = ({ loaded, total }) => onProgress?.({ loaded, total })
      request.onerror = () => reject(new Error('Upload failed'))
      request.onload = () => {
        if (request.status < 200 || request.status >= 300) return reject(new Error('Upload failed'))
        const result = JSON.parse(request.responseText) as { public_id: string; secure_url: string; resource_type: string; bytes: number }
        resolve({ id: `${result.resource_type}:${result.public_id}`, url: result.secure_url, kind: toMediaKind(result.resource_type), name: file.name, bytes: result.bytes })
      }
      request.send(form)
    })
  }

  async remove(id: string) {
    const response = await fetch('/api/media/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
    if (!response.ok) throw new Error('Could not remove media')
  }

  getDeliveryUrl(id: string) {
    if (id.startsWith('https://')) return id
    throw new Error('Use the delivery URL returned with the uploaded media')
  }
}

function toMediaKind(type: string): MediaKind {
  if (type === 'image' || type === 'video') return type
  if (type === 'raw') return 'document'
  return 'other'
}
