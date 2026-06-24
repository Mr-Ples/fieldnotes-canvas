import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Bold, Check, ChevronDown, Code2, File, FileText, Heading2, Italic, Link2, List, MessageCircle, MoreHorizontal, Plus, Quote, Reply, Send, Upload, Video } from 'lucide-react'
import { canvases, comments, resources, type Canvas, type Comment } from '../data'
import { Avatar, CopyLinkButton, IconButton, TabButton } from './Primitives'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { CloudinaryMediaStorage } from '../services/media'
import DiscordIdentity from './DiscordIdentity'

export default function CenterPanel() {
  const [tab, setTab] = useState<'notes' | 'resources'>('notes')
  const [tag, setTag] = useState('')
  const [tags, setTags] = useLocalStorage('fieldnotes:tags', ['design research', 'attention', 'interfaces'])
  const [saved, setSaved] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [activeCanvas, setActiveCanvas] = useState<Canvas>(() => {
    const stored = localStorage.getItem('fieldnotes:active-canvas')
    return stored ? JSON.parse(stored) as Canvas : canvases[0]
  })

  useEffect(() => {
    const target = window.location.hash.slice(1)
    if (target.startsWith('res-') || target.startsWith('comment-')) setTab('resources')
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [])
  const share = async () => {
    if (sharing) return
    setSharing(true)
    try {
      const snapshot: Record<string, string> = {}
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)
        if (key?.startsWith('fieldnotes:') && key !== 'fieldnotes:device-id' && key !== 'fieldnotes:owner-token') snapshot[key] = localStorage.getItem(key) ?? ''
      }
      const response = await fetch('/api/shares', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshot }) })
      const result = await response.json() as { token?: string; error?: string }
      if (!response.ok || !result.token) throw new Error(result.error ?? 'Could not create share link')
      const link = new URL(window.location.href)
      link.search = `?share=${result.token}`
      link.hash = ''
      await navigator.clipboard.writeText(link.toString())
      window.alert('Private view link copied to your clipboard.')
    } catch (reason) { window.alert(reason instanceof Error ? reason.message : 'Could not create share link') }
    finally { setSharing(false) }
  }
  useEffect(() => {
    const select = (event: Event) => setActiveCanvas((event as CustomEvent<Canvas>).detail)
    window.addEventListener('fieldnotes:canvas-selected', select)
    return () => window.removeEventListener('fieldnotes:canvas-selected', select)
  }, [])

  return <main className="center-panel" id="top">
    <header className="canvas-header">
      <div className="breadcrumbs"><span>Research</span><span>/</span><strong>{activeCanvas.title}</strong><ChevronDown size={14} /></div>
      <div className="header-actions"><DiscordIdentity compact/><span className="saved-state"><Check size={13} /> {saved ? 'Saved' : 'Saving…'}</span><button className="share-button" disabled={sharing} onClick={() => void share()}>{sharing ? 'Sharing…' : 'Share'} <ArrowUpRight size={15} /></button><IconButton label="More canvas options"><MoreHorizontal size={18} /></IconButton></div>
    </header>

    <div className="document-head">
      <span className="doc-kicker">RESEARCH CANVAS · UPDATED JUST NOW</span>
      <h1>{activeCanvas.title}</h1>
      <p>Notes on interfaces that protect focus, invite curiosity, and help ideas find each other.</p>
      <div className="tag-row">
        {tags.map((item) => <button key={item} className="tag">#{item}</button>)}
        <form onSubmit={(event) => { event.preventDefault(); if (tag.trim()) setTags([...tags, tag.trim()]); setTag('') }}>
          <Plus size={13} /><input aria-label="Add tag" placeholder="Add tag" value={tag} onChange={(event) => setTag(event.target.value)} />
        </form>
      </div>
    </div>

    <div className="content-tabs" role="tablist">
      <TabButton active={tab === 'notes'} onClick={() => setTab('notes')}>Notes</TabButton>
      <TabButton active={tab === 'resources'} onClick={() => setTab('resources')}>Resources <span className="count">4</span></TabButton>
    </div>
    {tab === 'notes' ? <Notes key={activeCanvas.id} canvasId={activeCanvas.id} setSaved={setSaved} /> : <Resources />}
  </main>
}

function Notes({ canvasId, setSaved }: { canvasId: string; setSaved: (value: boolean) => void }) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const editor = useRef<HTMLElement>(null)
  useEffect(() => {
    const saved = localStorage.getItem(`fieldnotes:notes-html:${canvasId}`)
    if (saved && editor.current) editor.current.innerHTML = saved
  }, [canvasId])
  const change = (event: React.FormEvent<HTMLElement>) => {
    setSaved(false)
    localStorage.setItem(`fieldnotes:notes-html:${canvasId}`, event.currentTarget.innerHTML)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaved(true), 650)
  }
  const format = (command: string, value?: string) => {
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
    const href = window.prompt('Paste a resource, comment, annotation, chat, or web URL')?.trim()
    if (href) format('createLink', href)
  }
  return <div className="note-wrap">
    <div className="format-bar" aria-label="Markdown formatting">
      <IconButton label="Heading" onClick={() => format('formatBlock', 'h2')}><Heading2 size={16} /></IconButton><IconButton label="Bold" onClick={() => format('bold')}><Bold size={16} /></IconButton><IconButton label="Italic" onClick={() => format('italic')}><Italic size={16} /></IconButton><span className="divider"/><IconButton label="Link" onClick={addLink}><Link2 size={16} /></IconButton><IconButton label="Bullet list" onClick={() => format('insertUnorderedList')}><List size={16} /></IconButton><IconButton label="Quote" onClick={() => format('formatBlock', 'blockquote')}><Quote size={16} /></IconButton><IconButton label="Code" onClick={() => format('formatBlock', 'pre')}><Code2 size={16} /></IconButton><div className="format-spacer"/><span className="markdown-label">Markdown</span>
    </div>
    <article ref={editor} className="note-editor" contentEditable suppressContentEditableWarning onInput={change} aria-label="Markdown notes">
      <h2>Attention is not a resource to extract</h2>
      <p>Most software treats attention as something to capture. A better frame might be to see it as a living material—finite, rhythmic, and shaped by context.</p>
      <p>The question changes from <em>“how do we keep someone here?”</em> to <mark id="annotation-1" onClick={() => { window.location.hash = 'annotation-comment-1' }}>“what kind of attention does this moment deserve?”</mark></p>
      <blockquote>Good tools do not demand focus. They create the conditions in which focus can emerge.</blockquote>
      <h2>Interfaces as environments</h2>
      <p>An interface can behave less like a sequence of prompts and more like a room. It can hold context, let ideas remain unfinished, and make returning feel natural.</p>
      <ul><li>Make state visible without making it loud.</li><li>Preserve the path back to an idea.</li><li>Let peripheral information stay peripheral.</li><li>Use motion to explain change, not decorate it.</li></ul>
      <h2>Notes toward a calmer system</h2>
      <p id="annotation-2" onClick={() => { window.location.hash = 'annotation-comment-2' }}>The best systems support a loop: notice, explore, make, step away, return. The return is as important as the capture.</p>
      <p className="empty-paragraph">Continue writing, or type “/” for commands…</p>
    </article>
  </div>
}

function Resources() {
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
    <section className="add-resource">
      <div className="drop-zone" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadFiles(event.dataTransfer.files) }}><input ref={fileInput} type="file" multiple hidden onChange={(event) => void uploadFiles(event.target.files)} /><span className="upload-icon"><Upload size={19} /></span><div><strong>{uploading || 'Drop files here or choose files'}</strong><small>PDF, image, video, audio · up to 500 MB</small></div></div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="or"><span />or add from a link<span /></div>
      <form className="url-input" onSubmit={(event) => { event.preventDefault(); void addLink() }}><Link2 size={17} /><input type="url" required placeholder="Paste an article, video, post, or any URL" value={url} onChange={(event) => setUrl(event.target.value)} /><button disabled={addingLink}>{addingLink ? 'Reading…' : 'Add'}</button></form>
    </section>
    <section className="resource-list"><div className="section-title"><h2>Resources <span>{added.length}</span></h2><button>Recently added <ChevronDown size={14} /></button></div>
      {added.map((resource) => <article className="resource-card deep-link-target" id={resource.id} key={resource.id}>
        <div className="resource-thumb" style={{ '--resource-accent': resource.accent } as React.CSSProperties}>{resource.kind === 'video' ? <Video /> : resource.kind === 'pdf' ? <FileText /> : resource.kind === 'chat' ? <MessageCircle /> : <File />}</div>
        <div className="resource-info"><span className="resource-kind">{resource.kind}</span><h3>{resource.title}</h3><p>{resource.meta}</p>{resource.url && <a className="mt-1 inline-flex text-[9px] text-emerald-800 underline" href={resource.url} target="_blank" rel="noreferrer">Open source</a>}{resource.content && <details className="mt-2 text-[10px]"><summary className="cursor-pointer text-emerald-800">Read extracted text</summary><div className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-100 p-3 font-serif text-xs leading-relaxed">{resource.content}</div></details>}</div>
        <div className="resource-actions"><CopyLinkButton target={resource.id} /><IconButton label="Resource options"><MoreHorizontal size={18}/></IconButton></div>
      </article>)}
    </section>
    <Comments />
  </div>
}

function Comments() {
  const [text, setText] = useState('')
  const [items, setItems] = useLocalStorage('fieldnotes:comments', comments)
  const add = () => { if (!text.trim()) return; setItems([...items, { id: `comment-${Date.now()}`, author: 'You', initials: 'YO', time: 'Now', body: text }]); setText('') }
  const reply = (id: string) => {
    const body = window.prompt('Write a reply')?.trim()
    if (!body) return
    const nested = { id: `reply-${crypto.randomUUID()}`, author: 'You', initials: 'YO', time: 'Now', body }
    setItems(items.map((item) => item.id === id ? { ...item, replies: [...(item.replies ?? []), nested] } : item))
  }
  return <section className="comments-section"><div className="section-title"><h2>Discussion <span>{items.length}</span></h2></div>
    <div className="comment-compose"><Avatar initials="YO" color="ink"/><div><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Add to the discussion…"/><button onClick={add} disabled={!text.trim()}><Send size={14}/> Comment</button></div></div>
    {items.map((comment) => <CommentItem key={comment.id} comment={comment} onReply={reply}/>)}</section>
}

function CommentItem({ comment, onReply }: { comment: Comment; onReply: (id: string) => void }) {
  return <article className="comment deep-link-target" id={comment.id}><Avatar initials={comment.initials} color="clay"/><div className="comment-body"><div><strong>{comment.author}</strong><time>{comment.time}</time></div><p>{comment.body}</p><div className="comment-actions"><button onClick={() => onReply(comment.id)}><Reply size={13}/> Reply</button><CopyLinkButton target={comment.id}/></div>{comment.replies?.map((reply) => <CommentItem key={reply.id} comment={reply} onReply={onReply}/>)}</div></article>
}
