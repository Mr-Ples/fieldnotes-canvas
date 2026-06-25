import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { Bold, ChevronDown, Code2, Eye, EyeClosed, File, FileText, Heading2, Italic, Link2, List, LogOut, MessageCircle, MoreVertical, Plus, Quote, Reply, Send, Settings, Trash2, Upload, Video, X } from 'lucide-react'
import { canvases, comments, projects, resources, type Canvas, type Comment } from '../data'
import { Avatar, CopyLinkButton, IconButton, TabButton } from './Primitives'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { CloudinaryMediaStorage } from '../services/media'
import DiscordIdentity, { signOutDiscord, type DiscordUser } from './DiscordIdentity'
import AnnotationLayer from './AnnotationLayer'
import { showConfirm, showPrompt, showToast } from './Popups'
import { getOwnerToken } from '../services/api'
import { getCollaborationSettings, saveCollaborationSettings, type AccessMode, type CollaborationSettings } from '../services/collaboration'

export default function CenterPanel() {
  const [tab, setTab] = useState<'notes' | 'resources'>('notes')
  const [tag, setTag] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [tags, setTags] = useLocalStorage('fieldnotes:tags', ['design research', 'attention', 'interfaces'])
  const [, setSaved] = useState(true)
  const [identity, setIdentity] = useState<DiscordUser | null>(null)
  const [canModerate, setCanModerate] = useState(false)
  const [canUseCanvas, setCanUseCanvas] = useState(false)
  const [memberAccess, setMemberAccess] = useState({ canvas: false, resources: false, discussion: false, llm: false, chat: false })
  const [accountMenu, setAccountMenu] = useState(false)
  const [collaborationDialog, setCollaborationDialog] = useState<'settings' | 'invite' | 'view' | null>(null)
  const [collaborationScope, setCollaborationScope] = useState<{ type: 'canvas' | 'project'; id: string }>({ type: 'canvas', id: '' })
  const [collaboration, setCollaboration] = useState<CollaborationSettings>(getCollaborationSettings)
  const [invitePermissions, setInvitePermissions] = useState({ canvas: true, resources: true, discussion: true, llm: true, chat: true })
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [storedAnnotationMode, setAnnotationMode] = useLocalStorage<'track' | 'hover' | 'hidden'>('fieldnotes:annotation-mode', 'track')
  const annotationMode: 'track' | 'hidden' = storedAnnotationMode === 'hidden' ? 'hidden' : 'track'
  const centerRef = useRef<HTMLElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const [activeCanvas, setActiveCanvas] = useState<Canvas>(() => {
    const stored = localStorage.getItem('fieldnotes:active-canvas')
    return stored ? JSON.parse(stored) as Canvas : canvases[0]
  })
  const scopeName = collaborationScope.type === 'project'
    ? (projects.find((project) => project.id === collaborationScope.id)?.title ?? collaborationScope.id)
    : (storedCanvases().find((canvas) => canvas.id === collaborationScope.id)?.title ?? activeCanvas.title)
  const dialogPurpose = collaborationDialog === 'invite' ? 'Create invite link' : collaborationDialog === 'view' ? 'My permissions' : 'Permissions'

  useEffect(() => {
    const target = window.location.hash.slice(1)
    if (target.startsWith('res-') || target.startsWith('comment-')) setTab('resources')
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [])
  const savePermissions = async () => {
    if (!await showConfirm({
      title: 'Save permission changes?',
      message: `Apply these permissions to ${collaborationScope.type === 'project' ? 'project' : 'canvas'} “${scopeName}”?`,
      confirmLabel: 'Save permissions',
    })) return
    if (collaborationScope.type === 'project') {
      try {
        const storedCanvases = JSON.parse(localStorage.getItem('fieldnotes:canvases') ?? JSON.stringify(canvases)) as Canvas[]
        const projectCanvases = storedCanvases.filter((canvas) => canvasProjectId(canvas) === collaborationScope.id)
        const responses = await Promise.all(projectCanvases.map((canvas) => fetch(`/api/canvases/${encodeURIComponent(canvas.id)}/settings`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-fieldnotes-owner-token': getOwnerToken() }, body: JSON.stringify({ settings: { locked: collaboration.chat === 'readonly', loginOnly: collaboration.chat === 'login', canvasMode: collaboration.canvas, resourceMode: collaboration.resources, discussionMode: collaboration.discussion, llmMode: collaboration.llm } }) })))
        if (responses.some((response) => !response.ok)) throw new Error('Some canvas settings could not be saved')
        localStorage.setItem(`fieldnotes:project-permissions:${collaborationScope.id}`, JSON.stringify(collaboration))
        setCollaborationDialog(null)
        showToast('Project permissions saved')
      } catch (reason) { showToast('Could not save project settings', reason instanceof Error ? reason.message : 'Try again') }
      return
    }
    saveCollaborationSettings(collaboration)
    try {
      const response = await fetch(`/api/canvases/${encodeURIComponent(activeCanvas.id)}/settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-fieldnotes-owner-token': getOwnerToken() },
        body: JSON.stringify({ settings: { locked: collaboration.chat === 'readonly', loginOnly: collaboration.chat === 'login', canvasMode: collaboration.canvas, resourceMode: collaboration.resources, discussionMode: collaboration.discussion, llmMode: collaboration.llm } }),
      })
      if (!response.ok) throw new Error('Chat settings could not be saved')
      setCollaborationDialog(null)
      showToast('Permissions saved')
    } catch (reason) { showToast('Could not save settings', reason instanceof Error ? reason.message : 'Try again') }
  }
  const createPermissionInvite = async () => {
    if (creatingInvite) return
    setCreatingInvite(true)
    try {
      if (collaborationScope.type === 'project') {
        const storedCanvases = JSON.parse(localStorage.getItem('fieldnotes:canvases') ?? JSON.stringify(canvases)) as Canvas[]
        const storedProjects = JSON.parse(localStorage.getItem('fieldnotes:projects') ?? JSON.stringify(projects)) as typeof projects
        const projectCanvases = storedCanvases.filter((canvas) => canvasProjectId(canvas) === collaborationScope.id).map((canvas) => ({ ...canvas, projectId: collaborationScope.id }))
        if (!projectCanvases.length) throw new Error('This project has no canvases')
        const tokens = await Promise.all(projectCanvases.map(async (canvas) => {
          const response = await fetch(`/api/canvases/${encodeURIComponent(canvas.id)}/invites`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-fieldnotes-owner-token': getOwnerToken() }, body: JSON.stringify({ permissions: invitePermissions }) })
          const result = await response.json() as { token?: string; error?: string }
          if (!response.ok || !result.token) throw new Error(result.error ?? `Could not create an invite for ${canvas.title}`)
          return [canvas.id, result.token] as const
        }))
        const snapshot = Object.fromEntries(tokens.map(([canvasId, token]) => [`fieldnotes:invite-token:${canvasId}`, token]))
        snapshot['fieldnotes:canvases'] = JSON.stringify(projectCanvases)
        snapshot['fieldnotes:projects'] = JSON.stringify(storedProjects.filter((project) => project.id === collaborationScope.id))
        snapshot['fieldnotes:active-canvas'] = JSON.stringify(projectCanvases[0])
        const shareResponse = await fetch('/api/shares', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshot }) })
        const share = await shareResponse.json() as { token?: string; error?: string }
        if (!shareResponse.ok || !share.token) throw new Error(share.error ?? 'Could not create the project link')
        const url = new URL(window.location.href); url.search = ''; url.hash = ''; url.searchParams.set('share', share.token)
        await navigator.clipboard.writeText(url.toString())
        setCollaborationDialog(null)
        showToast('Project invite link copied')
        return
      }
      const response = await fetch(`/api/canvases/${encodeURIComponent(activeCanvas.id)}/invites`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-fieldnotes-owner-token': getOwnerToken() },
        body: JSON.stringify({ permissions: invitePermissions }),
      })
      const result = await response.json() as { token?: string; error?: string }
      if (!response.ok || !result.token) throw new Error(result.error ?? 'Could not create invite')
      const url = new URL(window.location.href)
      url.searchParams.set('canvas', activeCanvas.id); url.searchParams.set('invite', result.token)
      await navigator.clipboard.writeText(url.toString())
      setCollaborationDialog(null)
      showToast('Invite link copied')
    } catch (reason) { showToast('Could not create invite', reason instanceof Error ? reason.message : 'Try again') }
    finally { setCreatingInvite(false) }
  }
  useEffect(() => {
    const select = (event: Event) => setActiveCanvas((event as CustomEvent<Canvas>).detail)
    const moderation = (event: Event) => setCanModerate(Boolean((event as CustomEvent<boolean>).detail))
    const access = (event: Event) => setCanUseCanvas(Boolean((event as CustomEvent<{ canvas: boolean }>).detail.canvas))
    const permissions = (event: Event) => {
      const detail = (event as CustomEvent<{ settings: { locked: boolean; loginOnly: boolean; canvasMode?: AccessMode; resourceMode?: AccessMode; discussionMode?: AccessMode; llmMode?: AccessMode }; access: typeof memberAccess }>).detail
      setMemberAccess(detail.access)
      setCollaboration({ canvas: detail.settings.canvasMode ?? 'public', resources: detail.settings.resourceMode ?? 'public', discussion: detail.settings.discussionMode ?? 'public', llm: detail.settings.llmMode ?? 'public', chat: detail.settings.locked ? 'readonly' : detail.settings.loginOnly ? 'login' : 'public' })
    }
    const openPermissions = (event: Event) => {
      const detail = (event as CustomEvent<'settings' | 'invite' | 'view' | { dialog: 'settings' | 'invite' | 'view'; scope: 'canvas' | 'project'; projectId?: string; canvasId?: string }>).detail
      const dialog = typeof detail === 'string' ? detail : detail.dialog
      const scope = typeof detail === 'string' ? { type: 'canvas' as const, id: activeCanvas.id } : { type: detail.scope, id: detail.projectId ?? detail.canvasId ?? activeCanvas.id }
      setCollaborationScope(scope)
      if (dialog === 'settings') setCollaboration(getCollaborationSettings())
      if (dialog === 'settings' && scope.type === 'project') {
        const saved = localStorage.getItem(`fieldnotes:project-permissions:${scope.id}`)
        if (saved) setCollaboration(JSON.parse(saved) as CollaborationSettings)
      }
      setCollaborationDialog(dialog)
    }
    const closeAccountMenu = (event: PointerEvent) => { if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenu(false) }
    window.addEventListener('fieldnotes:canvas-selected', select)
    window.addEventListener('fieldnotes:moderation-changed', moderation)
    window.addEventListener('fieldnotes:access-changed', access)
    window.addEventListener('fieldnotes:open-permissions', openPermissions)
    window.addEventListener('fieldnotes:permissions-changed', permissions)
    window.addEventListener('pointerdown', closeAccountMenu)
    return () => { window.removeEventListener('fieldnotes:canvas-selected', select); window.removeEventListener('fieldnotes:moderation-changed', moderation); window.removeEventListener('fieldnotes:access-changed', access); window.removeEventListener('fieldnotes:open-permissions', openPermissions); window.removeEventListener('fieldnotes:permissions-changed', permissions); window.removeEventListener('pointerdown', closeAccountMenu) }
  }, [])

  return <main ref={centerRef} className="center-panel" id="top">
    <div className="canvas-account-control"><div className="account-actions" ref={accountMenuRef}><DiscordIdentity compact onChange={setIdentity}/>{(identity || canModerate) && <IconButton label="Account and canvas options" onClick={() => setAccountMenu((open) => !open)}><MoreVertical size={18} /></IconButton>}{accountMenu && <div className="account-menu">
        {canModerate && <button onClick={() => { setCollaborationScope({ type: 'canvas', id: activeCanvas.id }); setCollaborationDialog('invite'); setAccountMenu(false) }}><Link2 size={14}/> Create invite link</button>}
        {canModerate && <button onClick={() => { setCollaborationScope({ type: 'canvas', id: activeCanvas.id }); setCollaboration(getCollaborationSettings()); setCollaborationDialog('settings'); setAccountMenu(false) }}><Settings size={14}/> Permissions</button>}
        {!canModerate && <button onClick={() => { setCollaborationScope({ type: 'canvas', id: activeCanvas.id }); setCollaborationDialog('view'); setAccountMenu(false) }}><Settings size={14}/> My permissions</button>}
        {identity && <button className="danger" onClick={() => { setAccountMenu(false); void signOutDiscord() }}><LogOut size={14}/> Logout</button>}
      </div>}</div></div>

    {collaborationDialog && <div className="collaboration-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCollaborationDialog(null) }}><section className="collaboration-dialog" role="dialog" aria-modal="true" aria-label={`${dialogPurpose} for ${scopeName}`}>
      <div className="collaboration-dialog-head"><div><span className="eyebrow">{collaborationScope.type === 'project' ? 'Project' : 'Canvas'} · {scopeName}{collaborationScope.type === 'project' ? ' · All canvases' : ''}</span><h2>{dialogPurpose}</h2></div><IconButton label="Close" onClick={() => setCollaborationDialog(null)}><X size={16}/></IconButton></div>
      {collaborationDialog === 'settings' ? <div className="permission-list">
        <PermissionSelect label="Canvas" description="Notes and annotations" value={collaboration.canvas} onChange={(canvas) => setCollaboration({ ...collaboration, canvas })}/>
        <PermissionSelect label="Resources" description="Add and save canvas resources" value={collaboration.resources} onChange={(resources) => setCollaboration({ ...collaboration, resources })}/>
        <PermissionSelect label="Discussion" description="Comments below the canvas tabs" value={collaboration.discussion} onChange={(discussion) => setCollaboration({ ...collaboration, discussion })}/>
        <PermissionSelect label="LLM chat" description="Ask questions and suggest saved answers" value={collaboration.llm} onChange={(llm) => setCollaboration({ ...collaboration, llm })}/>
        <PermissionSelect label="Discord chat" description="Discussion comments and connected chat" value={collaboration.chat} onChange={(chat) => setCollaboration({ ...collaboration, chat })}/>
      </div> : collaborationDialog === 'invite' ? <div className="permission-list">
        {(['canvas', 'resources', 'discussion', 'llm', 'chat'] as const).map((key) => <label className="invite-permission" key={key}><span><strong>{permissionLabel(key)}</strong><small>{permissionDescription(key)}</small></span><input type="checkbox" checked={invitePermissions[key]} onChange={(event) => setInvitePermissions({ ...invitePermissions, [key]: event.target.checked })}/></label>)}
      </div> : <div className="permission-list">{(['canvas', 'resources', 'discussion', 'llm', 'chat'] as const).map((key) => <div className="permission-readout" key={key}><span><strong>{permissionLabel(key)}</strong><small>{permissionDescription(key)}</small></span><b className={memberAccess[key] ? 'allowed' : ''}>{memberAccess[key] ? 'Allowed' : 'Read only'}</b></div>)}</div>}
      <div className="collaboration-dialog-actions"><button className="secondary" onClick={() => setCollaborationDialog(null)}>{collaborationDialog === 'view' ? 'Close' : 'Cancel'}</button>{collaborationDialog !== 'view' && <button onClick={() => void (collaborationDialog === 'invite' ? createPermissionInvite() : savePermissions())} disabled={creatingInvite}>{creatingInvite ? 'Creating…' : collaborationDialog === 'invite' ? 'Create and copy link' : 'Save settings'}</button>}</div>
    </section></div>}

    <div className="document-head">
      <span className="doc-kicker">RESEARCH CANVAS · UPDATED JUST NOW</span>
      <h1>{activeCanvas.title}</h1>
      <p>Notes on interfaces that protect focus, invite curiosity, and help ideas find each other.</p>
      <div className="tag-row">
        {tags.map((item) => <div key={item} className="tag"><span>#{item}</span>{canUseCanvas && <button type="button" onClick={() => setTags(tags.filter((tagItem) => tagItem !== item))} aria-label={`Remove tag ${item}`}><X size={11} /></button>}</div>)}
        {canUseCanvas && (!addingTag ? <button className="tag-add" type="button" onClick={() => setAddingTag(true)} aria-label="Add tag"><Plus size={13}/></button> : <form className="tag-form" onSubmit={(event) => { event.preventDefault(); if (tag.trim()) setTags([...tags, tag.trim()]); setTag(''); setAddingTag(false) }}>
          <input autoFocus aria-label="Add tag" placeholder="Tag name" value={tag} onChange={(event) => setTag(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setTag(''); setAddingTag(false) } }} />
        </form>)}
      </div>
    </div>

    <div className="content-tabs" role="tablist">
      <TabButton active={tab === 'notes'} onClick={() => setTab('notes')}>Notes</TabButton>
      <TabButton active={tab === 'resources'} onClick={() => setTab('resources')}>Resources <span className="count">4</span></TabButton>
      <button
        type="button"
        className="annotation-visibility-toggle icon-button ml-auto"
        onClick={() => setAnnotationMode(annotationMode === 'track' ? 'hidden' : 'track')}
        aria-label={annotationMode === 'track' ? 'Hide annotations' : 'Show annotations'}
        title={annotationMode === 'track' ? 'Hide annotations' : 'Show annotations'}
      >
        {annotationMode === 'track' ? <Eye size={16} /> : <EyeClosed size={16} />}
      </button>
    </div>
    {tab === 'notes' ? <Notes key={activeCanvas.id} canvasId={activeCanvas.id} setSaved={setSaved} containerRef={centerRef} canInteract={canUseCanvas} canSaveResource={memberAccess.resources} annotationMode={annotationMode} /> : <Resources canInteract={memberAccess.resources} />}
    <div className="discussion-view"><Comments canInteract={memberAccess.discussion} canSaveResource={memberAccess.resources} /></div>
  </main>
}

function permissionLabel(key: 'canvas' | 'resources' | 'discussion' | 'llm' | 'chat') {
  return key === 'resources' ? 'Resources' : key === 'discussion' ? 'Discussion' : key === 'llm' ? 'LLM chat' : key === 'chat' ? 'Discord chat' : 'Canvas'
}

function canvasProjectId(canvas: Canvas) {
  return canvas.projectId ?? (canvas.group === 'Active' ? 'attention-project' : canvas.group === 'Archive' ? 'fieldwork' : undefined)
}

function storedCanvases() {
  try { return JSON.parse(localStorage.getItem('fieldnotes:canvases') ?? JSON.stringify(canvases)) as Canvas[] }
  catch { return canvases }
}

function permissionDescription(key: 'canvas' | 'resources' | 'discussion' | 'llm' | 'chat') {
  return key === 'resources' ? 'Add and save canvas resources' : key === 'discussion' ? 'Post comments below the canvas' : key === 'llm' ? 'Use the canvas LLM chat' : key === 'chat' ? 'Post connected Discord chat messages' : 'Suggest edits and annotations'
}

function PermissionSelect({ label, description, value, onChange }: { label: string; description: string; value: AccessMode; onChange: (value: AccessMode) => void }) {
  return <label className="permission-select"><span><strong>{label}</strong><small>{description}</small></span><select value={value} onChange={(event) => onChange(event.target.value as AccessMode)}><option value="public">Anyone can suggest</option><option value="login">Login required</option><option value="readonly">Admin + invite only</option></select></label>
}

function Notes({ canvasId, setSaved, containerRef, canInteract, canSaveResource, annotationMode }: { canvasId: string; setSaved: (value: boolean) => void; containerRef: RefObject<HTMLElement | null>; canInteract: boolean; canSaveResource: boolean; annotationMode: 'track' | 'hidden' }) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const editor = useRef<HTMLElement>(null)
  useEffect(() => {
    const saved = localStorage.getItem(`fieldnotes:notes-html:${canvasId}`)
    if (saved && editor.current) editor.current.innerHTML = saved
  }, [canvasId])
  const change = (event: FormEvent<HTMLElement>) => {
    setSaved(false)
    localStorage.setItem(`fieldnotes:notes-html:${canvasId}`, event.currentTarget.innerHTML)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaved(true), 650)
  }
  const format = (command: string, value?: string) => {
    if (!canInteract) return
    editor.current?.focus()
    document.execCommand(command, false, value)
    if (editor.current) {
      localStorage.setItem(`fieldnotes:notes-html:${canvasId}`, editor.current.innerHTML)
      setSaved(false)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => setSaved(true), 650)
    }
  }
  const addLink = () => {
    void (async () => {
      const href = await showPrompt({
        title: 'Add link',
        message: 'Paste a resource, comment, annotation, chat, or web URL.',
        placeholder: 'https://…',
        confirmLabel: 'Add link',
      })
      if (href) format('createLink', href.trim())
    })()
  }
  return <div className={`note-wrap ${annotationMode === 'hidden' ? 'is-annotations-hidden' : ''}`}>
    <div className="format-bar" aria-label="Markdown formatting">
      <IconButton label="Heading" onClick={() => format('formatBlock', 'h2')}><Heading2 size={16} /></IconButton><IconButton label="Bold" onClick={() => format('bold')}><Bold size={16} /></IconButton><IconButton label="Italic" onClick={() => format('italic')}><Italic size={16} /></IconButton><span className="divider"/><IconButton label="Link" onClick={addLink}><Link2 size={16} /></IconButton><IconButton label="Bullet list" onClick={() => format('insertUnorderedList')}><List size={16} /></IconButton><IconButton label="Quote" onClick={() => format('formatBlock', 'blockquote')}><Quote size={16} /></IconButton><IconButton label="Code" onClick={() => format('formatBlock', 'pre')}><Code2 size={16} /></IconButton><div className="format-spacer"/><span className="markdown-label">Markdown</span>
    </div>
    <article ref={editor} className="note-editor" contentEditable={canInteract} suppressContentEditableWarning onInput={change} aria-label="Markdown notes" aria-readonly={!canInteract}>
      <h2>Attention is not a resource to extract</h2>
      <p>Most software treats attention as something to capture. A better frame might be to see it as a living material—finite, rhythmic, and shaped by context.</p>
      <p>The question changes from <em>“how do we keep someone here?”</em> to <mark id="annotation-1" onClick={() => { window.location.hash = 'annotation-comment-1' }}>“what kind of attention does this moment deserve?”</mark></p>
      <blockquote>Good tools do not demand focus. They create the conditions in which focus can emerge.</blockquote>
      <h2>Interfaces as environments</h2>
      <p>An interface can behave less like a sequence of prompts and more like a room. It can hold context, let ideas remain unfinished, and make returning feel natural.</p>
      <ul><li>Make state visible without making it loud.</li><li>Preserve the path back to an idea.</li><li>Let peripheral information stay peripheral.</li><li>Use motion to explain change, not decorate it.</li></ul>
      <h2>Notes toward a calmer system</h2>
      <p>The best systems support a loop: notice, explore, make, step away, return. <mark id="annotation-2" onClick={() => { window.location.hash = 'annotation-comment-2' }}>The return is as important as the capture.</mark></p>
      <p className="empty-paragraph">Continue writing, or type “/” for commands…</p>
    </article>
    <AnnotationLayer editorRef={editor} containerRef={containerRef} canvasId={canvasId} canInteract={canInteract} canSaveResource={canSaveResource} mode={annotationMode} onDocumentChange={() => {
      if (editor.current) localStorage.setItem(`fieldnotes:notes-html:${canvasId}`, editor.current.innerHTML)
    }}/>
  </div>
}

function Resources({ canInteract }: { canInteract: boolean }) {
  const [url, setUrl] = useState('')
  const [added, setAdded] = useLocalStorage('fieldnotes:resources', resources)
  const [uploading, setUploading] = useState('')
  const [addingLink, setAddingLink] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const storage = useRef(new CloudinaryMediaStorage())
  useEffect(() => {
    const sync = () => {
      const value = localStorage.getItem('fieldnotes:resources')
      if (value) setAdded(JSON.parse(value))
    }
    window.addEventListener('fieldnotes:resources-changed', sync)
    return () => window.removeEventListener('fieldnotes:resources-changed', sync)
  }, [setAdded])
  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setError('')
    for (const file of Array.from(files)) {
      if (file.size > 500 * 1024 * 1024) { setError(`${file.name} exceeds 500 MB`); continue }
      try {
        setUploading(`Uploading ${file.name}…`)
        const media = await storage.current.upload(file)
        const kind = media.kind === 'video' ? 'video' : media.kind === 'document' ? 'pdf' : 'article'
        setAdded((current) => [{ id: `res-${media.id}`, kind, title: media.name, meta: `${media.kind} · Uploaded now`, accent: '#52756a', url: media.url }, ...current])
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Upload failed') }
    }
    setUploading('')
  }
  const addLink = async () => {
    if (!url || addingLink) return
    const value = url
    const parsed = new URL(value)
    const video = /youtube|youtu\.be|vimeo/.test(parsed.hostname)
    const social = /twitter|x\.com/.test(parsed.hostname)
    setAddingLink(true); setError('')
    try {
      const response = await fetch('/api/resources/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: value }) })
      const result = await response.json() as { title?: string; description?: string; content?: string; error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Could not read link')
      setAdded([{ id: `res-${crypto.randomUUID()}`, kind: video ? 'video' : 'article', title: result.title || parsed.hostname, meta: social ? 'Social post · Linked now' : video ? 'Video · Transcription pending' : 'Article · Extracted now', accent: social ? '#334155' : '#52756a', url: value, content: result.content }, ...added])
      setUrl('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add link') }
    finally { setAddingLink(false) }
  }
  return <div className="resources-view">
    {canInteract && <section className="add-resource">
      <div className="drop-zone" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadFiles(event.dataTransfer.files) }}><input ref={fileInput} type="file" multiple hidden onChange={(event) => void uploadFiles(event.target.files)} /><span className="upload-icon"><Upload size={19} /></span><div><strong>{uploading || 'Drop files here or choose files'}</strong><small>PDF, image, video, audio · up to 500 MB</small></div></div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="or"><span />or add from a link<span /></div>
      <form className="url-input" onSubmit={(event) => { event.preventDefault(); void addLink() }}><Link2 size={17} /><input type="url" required placeholder="Paste an article, video, post, or any URL" value={url} onChange={(event) => setUrl(event.target.value)} /><button disabled={addingLink}>{addingLink ? 'Reading…' : 'Add'}</button></form>
    </section>}
    <section className="resource-list"><div className="section-title"><h2>Resources <span>{added.length}</span></h2><button>Recently added <ChevronDown size={14} /></button></div>
      {added.map((resource) => <article className="resource-card deep-link-target" id={resource.id} key={resource.id}>
        <div className="resource-thumb" style={{ '--resource-accent': resource.accent } as CSSProperties}>{resource.kind === 'video' ? <Video /> : resource.kind === 'pdf' ? <FileText /> : resource.kind === 'chat' ? <MessageCircle /> : <File />}</div>
        <div className="resource-info"><span className="resource-kind">{resource.kind}</span><h3>{resource.title}</h3><p>{resource.meta}</p>{resource.url && <a className="mt-1 inline-flex text-[9px] text-emerald-800 underline" href={resource.url} target="_blank" rel="noreferrer">Open source</a>}{resource.content && <details className="mt-2 text-[10px]"><summary className="cursor-pointer text-emerald-800">Read extracted text</summary><div className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-100 p-3 font-serif text-xs leading-relaxed">{resource.content}</div></details>}</div>
        <div className="resource-actions"><CopyLinkButton target={resource.id} /><IconButton label="Resource options"><MoreVertical size={18}/></IconButton></div>
      </article>)}
    </section>
  </div>
}

function Comments({ canInteract, canSaveResource }: { canInteract: boolean; canSaveResource: boolean }) {
  const [text, setText] = useState('')
  const [items, setItems] = useLocalStorage('fieldnotes:comments', comments)
  const [identity, setIdentity] = useState<{ id: string; displayName: string; avatar?: string } | null>(null)
  useEffect(() => {
    void fetch('/api/discord/me').then((response) => response.ok ? response.json() : null).then((result: { user?: { id: string; displayName: string; avatar?: string } } | null) => setIdentity(result?.user ?? null)).catch(() => {})
    const sync = (event: Event) => setIdentity((event as CustomEvent<{ id: string; displayName: string; avatar?: string } | null>).detail)
    window.addEventListener('fieldnotes:discord-auth-synced', sync)
    return () => window.removeEventListener('fieldnotes:discord-auth-synced', sync)
  }, [])
  const currentAuthor = identity?.displayName ?? 'You'
  const currentInitials = currentAuthor.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'YO'
  const add = () => { if (!text.trim()) return; setItems([...items, { id: `comment-${crypto.randomUUID()}`, author: currentAuthor, authorId: identity?.id, avatar: identity?.avatar, initials: currentInitials, time: 'Now', body: text.trim() }]); setText('') }
  const saveAsResource = (comment: Comment) => {
    const key = 'fieldnotes:resources'
    const current = JSON.parse(localStorage.getItem(key) ?? JSON.stringify(resources)) as unknown[]
    const content = [comment.body, ...(comment.replies ?? []).map((reply) => `${reply.author}: ${reply.body}`)].join('\n\n')
    localStorage.setItem(key, JSON.stringify([{ id: `res-comment-${crypto.randomUUID()}`, kind: 'chat', title: `Comment from ${comment.author}`, meta: `Comment · Saved ${new Date().toLocaleDateString()}`, accent: '#5865f2', content }, ...current]))
    window.dispatchEvent(new Event('fieldnotes:resources-changed'))
    showToast('Saved to resources')
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      add()
    }
  }
  const reply = (id: string) => {
    void (async () => {
      const body = await showPrompt({ title: 'Reply', message: 'Write a reply.', placeholder: 'Reply…', confirmLabel: 'Reply' })
      if (!body) return
      const nested = { id: `reply-${crypto.randomUUID()}`, author: currentAuthor, authorId: identity?.id, avatar: identity?.avatar, initials: currentInitials, time: 'Now', body: body.trim() }
      setItems(items.map((item) => item.id === id ? { ...item, replies: [...(item.replies ?? []), nested] } : item))
    })()
  }
  const remove = (id: string) => setItems(items.flatMap((item) => item.id === id ? [] : [{ ...item, replies: item.replies?.filter((replyItem) => replyItem.id !== id) }]))
  return <section className="comments-section"><div className="section-title"><h2>Discussion <span>{items.length}</span></h2></div>
    {canInteract && <div className="comment-compose"><Avatar initials={currentInitials} src={identity?.avatar} name={currentAuthor} color="ink"/><div><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={handleKeyDown} placeholder="Add to the discussion…"/><button onClick={add} disabled={!text.trim()}><Send size={14}/> Comment</button></div></div>}
    {items.map((comment) => <CommentItem key={comment.id} comment={comment} currentUserId={identity?.id} currentName={currentAuthor} currentAvatar={identity?.avatar} canInteract={canInteract} canSaveResource={canSaveResource} onReply={reply} onSave={saveAsResource} onDelete={remove}/>)}</section>
}

function CommentItem({ comment, currentUserId, currentName, currentAvatar, canInteract, canSaveResource, onReply, onSave, onDelete }: { comment: Comment; currentUserId?: string; currentName: string; currentAvatar?: string; canInteract: boolean; canSaveResource: boolean; onReply: (id: string) => void; onSave: (comment: Comment) => void; onDelete: (id: string) => void }) {
  const mine = comment.author === 'You' || Boolean(currentUserId && comment.authorId === currentUserId)
  const shownName = mine && comment.author === 'You' && currentUserId ? currentName : comment.author
  const shownAvatar = mine && comment.author === 'You' ? currentAvatar : comment.avatar
  return <article className="comment deep-link-target" id={comment.id}><Avatar initials={comment.initials} src={shownAvatar} name={shownName} color={mine ? 'ink' : 'clay'}/><div className="comment-body"><div><strong>{shownName}</strong><time>{comment.time}</time></div><p>{comment.body}</p><div className="comment-actions">{canInteract && <button onClick={() => onReply(comment.id)}><Reply size={13}/> Reply</button>}{canSaveResource && <button onClick={() => onSave(comment)}><FileText size={13} /> Save as resource</button>}<CopyLinkButton target={comment.id}/>{canInteract && mine && <button className="text-red-700" onClick={() => onDelete(comment.id)}><Trash2 size={13}/> Delete</button>}</div>{comment.replies?.map((reply) => <CommentItem key={reply.id} comment={reply} currentUserId={currentUserId} currentName={currentName} currentAvatar={currentAvatar} canInteract={canInteract} canSaveResource={canSaveResource} onReply={onReply} onSave={onSave} onDelete={onDelete}/>)}</div></article>
}
