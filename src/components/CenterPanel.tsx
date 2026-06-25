import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'
import { Bold, ChevronDown, Code2, Eye, EyeClosed, EyeOff, File, FileText, Heading1, Heading2, Heading3, Italic, Link2, List, LogOut, MessageCircle, MoreVertical, Plus, Quote, Reply, Send, Settings, Trash2, Upload, Video, X } from 'lucide-react'
import { canvases, comments, projects, resources, type Canvas, type Comment } from '../data'
import { Avatar, CopyLinkButton, IconButton, TabButton } from './Primitives'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { CloudinaryMediaStorage } from '../services/media'
import DiscordIdentity, { signOutDiscord, type DiscordUser } from './DiscordIdentity'
import AnnotationLayer from './AnnotationLayer'
import LinkPreviewLayer from './LinkPreviewLayer'
import { showConfirm, showPrompt, showToast } from './Popups'
import { getOwnerToken } from '../services/api'
import { getCollaborationSettings, saveCollaborationSettings, type AccessMode, type CollaborationSettings } from '../services/collaboration'
import { deepLinkKind, deepLinkTarget, linkKindForHref, navigateToDeepLink, scrollDeepLinkIntoView } from '../services/deepLinks'
import { decorateEditorLinks } from '../services/linkContent'

const CANVAS_SUBTITLE_MAX_LENGTH = 180

export default function CenterPanel() {
  const [tab, setTab] = useState<'notes' | 'resources'>('notes')
  const tabRef = useRef(tab)
  const scrollByTab = useRef<Record<'notes' | 'resources', number>>({ notes: 0, resources: 0 })
  const pendingScrollRestore = useRef<number | null>(null)
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
  const [storedAnnotationMode, setAnnotationMode] = useLocalStorage<'track' | 'compact' | 'hover' | 'hidden'>('fieldnotes:annotation-mode', 'track')
  const annotationMode: 'track' | 'compact' | 'hidden' = storedAnnotationMode === 'hidden' ? 'hidden' : storedAnnotationMode === 'compact' || storedAnnotationMode === 'hover' ? 'compact' : 'track'
  const centerRef = useRef<HTMLElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const pendingHeadingScroll = useRef<string | null>(null)
  const [activeCanvas, setActiveCanvas] = useState<Canvas>(() => {
    const requested = new URL(window.location.href).searchParams.get('canvas')
    const linked = requested ? storedCanvases().find((canvas) => canvas.id === requested) : undefined
    if (linked) {
      localStorage.setItem('fieldnotes:active-canvas', JSON.stringify(linked))
      return linked
    }
    const stored = localStorage.getItem('fieldnotes:active-canvas')
    if (stored) return JSON.parse(stored) as Canvas
    localStorage.setItem('fieldnotes:active-canvas', JSON.stringify(canvases[0]))
    return canvases[0]
  })
  const scopeName = collaborationScope.type === 'project'
    ? (projects.find((project) => project.id === collaborationScope.id)?.title ?? collaborationScope.id)
    : (storedCanvases().find((canvas) => canvas.id === collaborationScope.id)?.title ?? activeCanvas.title)
  const dialogPurpose = collaborationDialog === 'invite' ? 'Create invite link' : collaborationDialog === 'view' ? 'My permissions' : 'Permissions'
  const annotationToggleLabel = annotationMode === 'track' ? 'Compact annotations' : annotationMode === 'compact' ? 'Hide annotations' : 'Show annotations'
  const annotationToggleTooltip = annotationMode === 'track'
    ? 'Full annotations are visible. Click for compact pins.'
    : annotationMode === 'compact'
      ? 'Compact pins are on. Link icons are hidden. Click to hide annotations.'
      : 'Annotations are hidden. Click to show full annotations.'
  const canvasSubtitle = activeCanvas.subtitle ?? 'Notes on interfaces that protect focus, invite curiosity, and help ideas find each other.'
  const scrollRoot = () => centerRef.current?.closest<HTMLElement>('.app-shell') ?? null
  const rememberCurrentTabScroll = () => {
    const root = scrollRoot()
    if (root) scrollByTab.current[tabRef.current] = root.scrollTop
  }
  const openTab = (next: 'notes' | 'resources', restore = true) => {
    if (next === tabRef.current) return
    rememberCurrentTabScroll()
    tabRef.current = next
    window.dispatchEvent(new CustomEvent('fieldnotes:center-tab-changed', { detail: { tab: next } }))
    pendingScrollRestore.current = restore ? scrollByTab.current[next] : null
    setTab(next)
  }
  useEffect(() => {
    const openNotes = (event: Event) => openTab('notes', Boolean((event as CustomEvent<{ restore?: boolean }>).detail?.restore))
    window.addEventListener('fieldnotes:open-notes-tab', openNotes)
    return () => window.removeEventListener('fieldnotes:open-notes-tab', openNotes)
  }, [])
  useLayoutEffect(() => {
    tabRef.current = tab
    const top = pendingScrollRestore.current
    if (top === null) return
    pendingScrollRestore.current = null
    const root = scrollRoot()
    if (root) root.scrollTop = top
  }, [tab])

  useEffect(() => {
    if (tab !== 'notes' || !pendingHeadingScroll.current) return
    const target = pendingHeadingScroll.current
    pendingHeadingScroll.current = null
    window.setTimeout(() => scrollDeepLinkIntoView(target, 'smooth'), 80)
  }, [activeCanvas.id, tab])

  useEffect(() => {
    const reveal = () => {
      const url = new URL(window.location.href)
      const target = deepLinkTarget()
      const kind = deepLinkKind(target)
      const linkedCanvasId = url.searchParams.get('canvas')
      const activeId = (JSON.parse(localStorage.getItem('fieldnotes:active-canvas') ?? JSON.stringify(activeCanvas)) as Canvas).id
      if (kind !== 'canvas' && target && linkedCanvasId && linkedCanvasId !== activeId) {
        const canvas = storedCanvases().find((item) => item.id === linkedCanvasId)
        if (!canvas) return
        pendingHeadingScroll.current = target
        openTab('notes', false)
        setActiveCanvas(canvas)
        localStorage.setItem('fieldnotes:active-canvas', JSON.stringify(canvas))
        window.dispatchEvent(new CustomEvent('fieldnotes:canvas-selected', { detail: canvas }))
        return
      }
      if (kind === 'resource' || kind === 'comment') {
        openTab('resources', false)
        scrollDeepLinkIntoView(target)
      } else if (kind === 'canvas') {
        const canvas = storedCanvases().find((item) => item.id === target.replace(/^canvas-/, ''))
        if (!canvas) return
        if (url.searchParams.has('canvas')) {
          url.searchParams.delete('canvas')
          window.history.replaceState(null, '', url.pathname + url.search + url.hash)
        }
        openTab('notes')
        setActiveCanvas(canvas)
        localStorage.setItem('fieldnotes:active-canvas', JSON.stringify(canvas))
        window.dispatchEvent(new CustomEvent('fieldnotes:canvas-selected', { detail: canvas }))
      } else if ((kind === 'unknown' || kind === 'heading') && target) scrollDeepLinkIntoView(target)
    }
    reveal()
    window.addEventListener('hashchange', reveal)
    return () => window.removeEventListener('hashchange', reveal)
  }, [])
  const updateCanvasMeta = (patch: Partial<Pick<Canvas, 'title' | 'subtitle'>>) => {
    const nextActive = { ...activeCanvas, ...patch }
    const stored = storedCanvases()
    const nextCanvases = stored.some((canvas) => canvas.id === nextActive.id)
      ? stored.map((canvas) => canvas.id === nextActive.id ? { ...canvas, ...patch } : canvas)
      : [nextActive, ...stored]
    setActiveCanvas(nextActive)
    localStorage.setItem('fieldnotes:active-canvas', JSON.stringify(nextActive))
    localStorage.setItem('fieldnotes:canvases', JSON.stringify(nextCanvases))
    window.dispatchEvent(new CustomEvent('fieldnotes:canvases-changed', { detail: nextCanvases }))
    window.dispatchEvent(new CustomEvent('fieldnotes:canvas-selected', { detail: nextActive }))
  }
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
    const canvasesChanged = (event: Event) => {
      const next = (event as CustomEvent<Canvas[]>).detail
      const current = Array.isArray(next) ? next.find((canvas) => canvas.id === activeCanvas.id) : undefined
      if (current) {
        setActiveCanvas(current)
        localStorage.setItem('fieldnotes:active-canvas', JSON.stringify(current))
      }
    }
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
    window.addEventListener('fieldnotes:canvases-changed', canvasesChanged)
    window.addEventListener('fieldnotes:moderation-changed', moderation)
    window.addEventListener('fieldnotes:access-changed', access)
    window.addEventListener('fieldnotes:open-permissions', openPermissions)
    window.addEventListener('fieldnotes:permissions-changed', permissions)
    window.addEventListener('pointerdown', closeAccountMenu)
    return () => { window.removeEventListener('fieldnotes:canvas-selected', select); window.removeEventListener('fieldnotes:canvases-changed', canvasesChanged); window.removeEventListener('fieldnotes:moderation-changed', moderation); window.removeEventListener('fieldnotes:access-changed', access); window.removeEventListener('fieldnotes:open-permissions', openPermissions); window.removeEventListener('fieldnotes:permissions-changed', permissions); window.removeEventListener('pointerdown', closeAccountMenu) }
  }, [activeCanvas.id])

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
      <input className="canvas-title-input" aria-label="Canvas title" value={activeCanvas.title} onChange={(event) => updateCanvasMeta({ title: event.target.value })} />
      <textarea className="canvas-subtitle-input" aria-label="Canvas subtitle" value={canvasSubtitle.slice(0, CANVAS_SUBTITLE_MAX_LENGTH)} onChange={(event) => updateCanvasMeta({ subtitle: event.target.value.slice(0, CANVAS_SUBTITLE_MAX_LENGTH) })} maxLength={CANVAS_SUBTITLE_MAX_LENGTH} rows={2} />
      <div className="tag-row">
        {tags.map((item) => <div key={item} className="tag"><span>#{item}</span>{canUseCanvas && <button type="button" onClick={() => setTags(tags.filter((tagItem) => tagItem !== item))} aria-label={`Remove tag ${item}`}><X size={11} /></button>}</div>)}
        {canUseCanvas && (!addingTag ? <button className="tag-add" type="button" onClick={() => setAddingTag(true)} aria-label="Add tag"><Plus size={13}/></button> : <form className="tag-form" onSubmit={(event) => { event.preventDefault(); if (tag.trim()) setTags([...tags, tag.trim()]); setTag(''); setAddingTag(false) }}>
          <input autoFocus aria-label="Add tag" placeholder="Tag name" value={tag} onChange={(event) => setTag(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setTag(''); setAddingTag(false) } }} />
        </form>)}
      </div>
    </div>

    <div className="content-tabs" role="tablist">
      <TabButton active={tab === 'notes'} onClick={() => openTab('notes')}>Notes</TabButton>
      <TabButton active={tab === 'resources'} onClick={() => openTab('resources')}>Resources <span className="count">4</span></TabButton>
      <button
        type="button"
        className="annotation-visibility-toggle icon-button ml-auto"
        onClick={() => setAnnotationMode(annotationMode === 'track' ? 'compact' : annotationMode === 'compact' ? 'hidden' : 'track')}
        aria-label={annotationToggleLabel}
      >
        {annotationMode === 'track' ? <Eye size={16} /> : annotationMode === 'compact' ? <EyeClosed size={16} /> : <EyeOff size={16} />}
        <span className="annotation-toggle-tooltip" aria-hidden="true">{annotationToggleTooltip}</span>
      </button>
    </div>
    <div hidden={tab !== 'notes'}>
      <Notes key={activeCanvas.id} canvasId={activeCanvas.id} setSaved={setSaved} containerRef={centerRef} canInteract={canUseCanvas} canSaveResource={memberAccess.resources} annotationMode={annotationMode} onPendingHeadingScroll={(target) => { pendingHeadingScroll.current = target }} />
    </div>
    {tab === 'resources' && <Resources canInteract={memberAccess.resources} />}
    <div className="discussion-view"><Comments canInteract={memberAccess.discussion} canSaveResource={memberAccess.resources} /></div>
    <LinkPreviewLayer rootRef={centerRef} />
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

function Notes({ canvasId, setSaved, containerRef, canInteract, canSaveResource, annotationMode, onPendingHeadingScroll }: { canvasId: string; setSaved: (value: boolean) => void; containerRef: RefObject<HTMLElement | null>; canInteract: boolean; canSaveResource: boolean; annotationMode: 'track' | 'compact' | 'hidden'; onPendingHeadingScroll: (target: string) => void }) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const editor = useRef<HTMLElement>(null)
  const [hasTextSelection, setHasTextSelection] = useState(false)
  const [activeBlockTag, setActiveBlockTag] = useState('')
  useEffect(() => {
    const saved = localStorage.getItem(`fieldnotes:notes-html:${canvasId}`)
    if (saved && editor.current) editor.current.innerHTML = saved
    cleanupEditorStructure(editor.current)
    decorateEditorLinks(editor.current)
  }, [canvasId])
  useEffect(() => {
    const current = editor.current
    if (!current) return
    const mutated = () => {
      cleanupEditorStructure(current)
      decorateEditorLinks(current)
      persistEditor()
    }
    current.addEventListener('fieldnotes:note-html-mutated', mutated)
    return () => current.removeEventListener('fieldnotes:note-html-mutated', mutated)
  })
  const change = (event: FormEvent<HTMLElement>) => {
    cleanupEditorStructure(event.currentTarget)
    decorateEditorLinks(event.currentTarget)
    setSaved(false)
    localStorage.setItem(`fieldnotes:notes-html:${canvasId}`, serializedEditorHtml(event.currentTarget))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaved(true), 650)
  }
  const format = (command: string, value?: string) => {
    if (!canInteract) return
    editor.current?.focus()
    document.execCommand(command, false, value)
    decorateEditorLinks(editor.current)
    persistEditor()
    updateSelectionState()
  }
  const selectedBlock = () => {
    const range = selectedEditorRange()
    if (!range || !editor.current) return null
    let node: Node | null = range.startContainer
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement
    while (node && node !== editor.current) {
      if (node instanceof HTMLElement && /^(H[1-6]|P|BLOCKQUOTE|PRE|LI|DIV)$/i.test(node.tagName)) return node
      node = node.parentElement
    }
    return null
  }
  const selectedAncestor = (selector: string) => {
    const range = selectedEditorRange()
    if (!range || !editor.current) return null
    let node: Node | null = range.startContainer
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement
    while (node && node !== editor.current) {
      if (node instanceof HTMLElement && node.matches(selector)) return node
      node = node.parentElement
    }
    return null
  }
  const toggleBlock = (tagName: 'h1' | 'h2' | 'h3' | 'blockquote' | 'pre') => {
    const block = tagName === 'blockquote' || tagName === 'pre' ? selectedAncestor(tagName) : selectedBlock()
    if (tagName === 'blockquote' && block instanceof HTMLQuoteElement) {
      unwrapBlockquote(block)
      cleanupEditorStructure(editor.current)
      decorateEditorLinks(editor.current)
      persistEditor()
      return
    }
    if (block && (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'pre')) {
      const nextTag = block.tagName.toLowerCase() === tagName ? 'p' : tagName
      const replacement = replaceBlockElement(block, nextTag)
      if (!replacement.textContent?.trim()) {
        persistEditor()
        updateSelectionState()
        return
      }
      cleanupEditorStructure(editor.current)
      decorateEditorLinks(editor.current)
      persistEditor()
      updateSelectionState()
      return
    }
    format('formatBlock', block?.tagName.toLowerCase() === tagName ? 'p' : tagName)
  }
  const updateSelectionState = () => {
    const range = selectedEditorRange()
    setHasTextSelection(Boolean(range && !range.collapsed && range.toString().trim()))
    setActiveBlockTag(selectedBlock()?.tagName.toLowerCase() ?? '')
  }
  const persistEditor = () => {
    if (!editor.current) return
    localStorage.setItem(`fieldnotes:notes-html:${canvasId}`, serializedEditorHtml(editor.current))
    setSaved(false)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaved(true), 650)
  }
  const selectedEditorRange = () => {
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount || !editor.current) return null
    const range = selection.getRangeAt(0)
    return editor.current.contains(range.commonAncestorContainer) ? range.cloneRange() : null
  }
  const restoreEditorRange = (range: Range | null) => {
    editor.current?.focus()
    if (!range) return
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  const preserveEditorScroll = (action: () => void) => {
    const scrollRoot = editor.current?.closest<HTMLElement>('.app-shell')
    const scrollTop = scrollRoot?.scrollTop
    action()
    if (scrollRoot && scrollTop !== undefined) {
      requestAnimationFrame(() => {
        scrollRoot.scrollTop = scrollTop
        requestAnimationFrame(() => { scrollRoot.scrollTop = scrollTop })
      })
      window.setTimeout(() => { scrollRoot.scrollTop = scrollTop }, 120)
    }
  }
  const linkSelectedText = (href: string) => {
    format('createLink', href)
    persistEditor()
  }
  const addLink = () => {
    if (!hasTextSelection) return
    void (async () => {
      const range = selectedEditorRange()
      if (!range || range.collapsed || !range.toString().trim()) return
      const href = await showPrompt({
        title: 'Add link',
        message: 'Paste a resource, comment, annotation, chat, or web URL.',
        placeholder: 'https://…',
        confirmLabel: 'Add link',
      })
      if (!href) return
      restoreEditorRange(range)
      linkSelectedText(href.trim())
    })()
  }
  const linkifyPaste = (event: ClipboardEvent<HTMLElement>) => {
    if (!canInteract) return
    const range = selectedEditorRange()
    const href = pastedLink(event.clipboardData.getData('text/plain'))
    if (!href || !range || range.collapsed) return
    event.preventDefault()
    restoreEditorRange(range)
    linkSelectedText(href)
  }
  const followInternalLink = (event: MouseEvent<HTMLElement>) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]')
    if (!link) return
    const url = new URL(link.href, window.location.href)
    const currentUrl = new URL(window.location.href)
    const kind = linkKindForHref(link.href)
    event.preventDefault()
    if (link.classList.contains('heading-link') && url.hash) {
      const copyUrl = new URL(window.location.href)
      copyUrl.searchParams.set('canvas', canvasId)
      copyUrl.hash = url.hash
      void navigator.clipboard.writeText(copyUrl.toString()).then(() => showToast('Heading link copied')).catch(() => showToast('Could not copy link'))
      return
    }
    if (url.origin === currentUrl.origin && url.pathname === currentUrl.pathname && url.hash) {
      const linkedCanvasId = url.searchParams.get('canvas')
      const navigate = () => {
        if (linkedCanvasId && linkedCanvasId !== canvasId) {
          const canvas = storedCanvases().find((item) => item.id === linkedCanvasId)
          if (canvas) {
            onPendingHeadingScroll(url.hash.slice(1))
            localStorage.setItem('fieldnotes:active-canvas', JSON.stringify(canvas))
            window.dispatchEvent(new CustomEvent('fieldnotes:canvas-selected', { detail: canvas }))
          }
        }
        const previous = window.location.href
        window.history.pushState(null, '', url.pathname + url.search + url.hash)
        window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: previous, newURL: window.location.href }))
        if (kind === 'heading' || linkedCanvasId) {
          if (linkedCanvasId && linkedCanvasId !== canvasId) return
          window.setTimeout(() => scrollDeepLinkIntoView(url.hash.slice(1), 'smooth'), 0)
        }
      }
      if (kind === 'annotation' || kind === 'llm-chat' || kind === 'discord-message' || kind === 'canvas') preserveEditorScroll(navigate)
      else navigate()
      return
    }
    window.open(url.toString(), '_blank', 'noopener,noreferrer')
  }
  const preventLinkMouseDown = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as Element).closest<HTMLAnchorElement>('a[href]')) event.preventDefault()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
    const block = selectedBlock()
    if (!block?.matches('h1, h2, h3, h4, h5, h6')) return
    event.preventDefault()
    const paragraph = document.createElement('p')
    paragraph.append(document.createElement('br'))
    block.after(paragraph)
    placeCaretAtStart(paragraph)
    cleanupEditorStructure(editor.current)
    decorateEditorLinks(editor.current)
    persistEditor()
  }
  useEffect(() => {
    document.addEventListener('selectionchange', updateSelectionState)
    return () => document.removeEventListener('selectionchange', updateSelectionState)
  })
  return <div className={`note-wrap ${annotationMode === 'compact' ? 'is-annotations-compact' : ''} ${annotationMode === 'hidden' ? 'is-annotations-hidden' : ''}`}>
    <div className="format-bar" aria-label="Markdown formatting" onMouseDown={(event) => event.preventDefault()}>
      <IconButton label="Heading 1" className={activeBlockTag === 'h1' ? 'is-active' : ''} aria-pressed={activeBlockTag === 'h1'} onClick={() => toggleBlock('h1')}><Heading1 size={16} /></IconButton><IconButton label="Heading 2" className={activeBlockTag === 'h2' ? 'is-active' : ''} aria-pressed={activeBlockTag === 'h2'} onClick={() => toggleBlock('h2')}><Heading2 size={16} /></IconButton><IconButton label="Heading 3" className={activeBlockTag === 'h3' ? 'is-active' : ''} aria-pressed={activeBlockTag === 'h3'} onClick={() => toggleBlock('h3')}><Heading3 size={16} /></IconButton><IconButton label="Bold" onClick={() => format('bold')}><Bold size={16} /></IconButton><IconButton label="Italic" onClick={() => format('italic')}><Italic size={16} /></IconButton><span className="divider"/><IconButton label="Link" onMouseDown={(event) => event.preventDefault()} onClick={addLink} disabled={!hasTextSelection}><Link2 size={16} /></IconButton><IconButton label="Bullet list" onClick={() => format('insertUnorderedList')}><List size={16} /></IconButton><IconButton label="Quote" onClick={() => toggleBlock('blockquote')}><Quote size={16} /></IconButton><IconButton label="Code" onClick={() => toggleBlock('pre')}><Code2 size={16} /></IconButton><div className="format-spacer"/><span className="markdown-label">Markdown</span>
    </div>
    <article ref={editor} className="note-editor" contentEditable={canInteract} suppressContentEditableWarning onInput={change} onPaste={linkifyPaste} onMouseDown={preventLinkMouseDown} onMouseUp={updateSelectionState} onKeyUp={updateSelectionState} onKeyDown={handleKeyDown} onClick={followInternalLink} aria-label="Markdown notes" aria-readonly={!canInteract}>
      <h2>Attention is not a resource to extract</h2>
      <p>Most software treats attention as something to capture. A better frame might be to see it as a living material—finite, rhythmic, and shaped by context.</p>
      <p>The question changes from <em>“how do we keep someone here?”</em> to <mark id="annotation-1" onClick={() => preserveEditorScroll(() => navigateToDeepLink('annotation-comment-1'))}>“what kind of attention does this moment deserve?”</mark></p>
      <blockquote>Good tools do not demand focus. They create the conditions in which focus can emerge.</blockquote>
      <h2>Interfaces as environments</h2>
      <p>An interface can behave less like a sequence of prompts and more like a room. It can hold context, let ideas remain unfinished, and make returning feel natural.</p>
      <ul><li>Make state visible without making it loud.</li><li>Preserve the path back to an idea.</li><li>Let peripheral information stay peripheral.</li><li>Use motion to explain change, not decorate it.</li></ul>
      <h2>Notes toward a calmer system</h2>
      <p>The best systems support a loop: notice, explore, make, step away, return. <mark id="annotation-2" onClick={() => preserveEditorScroll(() => navigateToDeepLink('annotation-comment-2'))}>The return is as important as the capture.</mark></p>
      <p className="empty-paragraph">Continue writing, or type “/” for commands…</p>
    </article>
    <AnnotationLayer editorRef={editor} containerRef={containerRef} canvasId={canvasId} canInteract={canInteract} canSaveResource={canSaveResource} mode={annotationMode} onDocumentChange={() => {
      if (editor.current) localStorage.setItem(`fieldnotes:notes-html:${canvasId}`, serializedEditorHtml(editor.current))
    }}/>
  </div>
}

function pastedLink(value: string) {
  const trimmed = value.trim()
  if (!trimmed || /\s/.test(trimmed)) return ''
  if (trimmed.startsWith('#')) return trimmed
  try {
    const url = new URL(trimmed, window.location.href)
    return /^(https?:|mailto:|tel:)$/i.test(url.protocol) ? trimmed : ''
  } catch { return '' }
}

function unwrapBlockquote(blockquote: HTMLQuoteElement) {
  const replacement = document.createDocumentFragment()
  const children = Array.from(blockquote.childNodes)
  const hasBlockChildren = children.some((node) => node instanceof HTMLElement && /^(P|DIV|UL|OL|PRE|H[1-6])$/i.test(node.tagName))
  if (hasBlockChildren) {
    children.forEach((node) => replacement.append(node))
  } else {
    const paragraph = document.createElement('p')
    children.forEach((node) => paragraph.append(node))
    replacement.append(paragraph)
  }
  blockquote.replaceWith(replacement)
}

function replaceBlockElement(block: HTMLElement, tagName: string) {
  const replacement = document.createElement(tagName)
  Array.from(block.attributes).forEach((attribute) => {
    if (attribute.name !== 'id' && attribute.name !== 'class') replacement.setAttribute(attribute.name, attribute.value)
  })
  Array.from(block.childNodes).forEach((node) => {
    if (node instanceof HTMLElement && node.classList.contains('heading-link')) return
    replacement.append(node)
  })
  if (!replacement.textContent?.trim() && !replacement.querySelector('br')) replacement.append(document.createElement('br'))
  block.replaceWith(replacement)
  placeCaretAtEnd(replacement)
  return replacement
}

function placeCaretAtStart(element: HTMLElement) {
  element.focus()
  const range = document.createRange()
  range.setStart(element, 0)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function placeCaretAtEnd(element: HTMLElement) {
  element.focus()
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function cleanupEditorStructure(root: HTMLElement | null) {
  if (!root) return
  root.querySelectorAll('.heading-link').forEach((link) => {
    if (!link.parentElement?.matches('h1, h2, h3, h4, h5, h6')) link.remove()
  })
  root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    const clone = heading.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.heading-link').forEach((link) => link.remove())
    if (!clone.textContent?.trim()) heading.remove()
  })
}

function serializedEditorHtml(root: HTMLElement) {
  const clone = root.cloneNode(true) as HTMLElement
  cleanupEditorStructure(clone)
  clone.querySelectorAll('.note-link-marker').forEach((marker) => marker.remove())
  clone.querySelectorAll('.heading-link').forEach((link) => link.remove())
  return clone.innerHTML
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
