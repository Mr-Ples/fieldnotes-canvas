import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Bold, Check, ChevronDown, Code2, File, FileText, Heading2, Italic, Link2, List, MessageCircle, MoreHorizontal, Plus, Quote, Reply, Send, Upload, Video } from 'lucide-react'
import { comments, resources, type Comment } from '../data'
import { Avatar, CopyLinkButton, IconButton, TabButton } from './Primitives'

export default function CenterPanel() {
  const [tab, setTab] = useState<'notes' | 'resources'>('notes')
  const [tag, setTag] = useState('')
  const [tags, setTags] = useState(['design research', 'attention', 'interfaces'])
  const [saved, setSaved] = useState(true)

  useEffect(() => {
    const target = window.location.hash.slice(1)
    if (target.startsWith('res-') || target.startsWith('comment-')) setTab('resources')
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [])

  return <main className="center-panel" id="top">
    <header className="canvas-header">
      <div className="breadcrumbs"><span>Research</span><span>/</span><strong>Designing for attention</strong><ChevronDown size={14} /></div>
      <div className="header-actions"><span className="saved-state"><Check size={13} /> {saved ? 'Saved' : 'Saving…'}</span><button className="share-button">Share <ArrowUpRight size={15} /></button><IconButton label="More canvas options"><MoreHorizontal size={18} /></IconButton></div>
    </header>

    <div className="document-head">
      <span className="doc-kicker">RESEARCH CANVAS · UPDATED JUST NOW</span>
      <h1>Designing for attention</h1>
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
    {tab === 'notes' ? <Notes setSaved={setSaved} /> : <Resources />}
  </main>
}

function Notes({ setSaved }: { setSaved: (value: boolean) => void }) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const change = () => {
    setSaved(false)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaved(true), 650)
  }
  return <div className="note-wrap">
    <div className="format-bar" aria-label="Markdown formatting">
      <IconButton label="Heading"><Heading2 size={16} /></IconButton><IconButton label="Bold"><Bold size={16} /></IconButton><IconButton label="Italic"><Italic size={16} /></IconButton><span className="divider"/><IconButton label="Link"><Link2 size={16} /></IconButton><IconButton label="Bullet list"><List size={16} /></IconButton><IconButton label="Quote"><Quote size={16} /></IconButton><IconButton label="Code"><Code2 size={16} /></IconButton><div className="format-spacer"/><span className="markdown-label">Markdown</span>
    </div>
    <article className="note-editor" contentEditable suppressContentEditableWarning onInput={change} aria-label="Markdown notes">
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
  const [added, setAdded] = useState(resources)
  const fileInput = useRef<HTMLInputElement>(null)
  return <div className="resources-view">
    <section className="add-resource">
      <div className="drop-zone" onClick={() => fileInput.current?.click()}><input ref={fileInput} type="file" multiple hidden /><span className="upload-icon"><Upload size={19} /></span><div><strong>Drop files here or choose files</strong><small>PDF, image, video, audio · up to 500 MB</small></div></div>
      <div className="or"><span />or add from a link<span /></div>
      <form className="url-input" onSubmit={(event) => { event.preventDefault(); if (!url) return; setAdded([{ id: `res-${Date.now()}`, kind: 'article', title: new URL(url).hostname, meta: 'Link · Processing', accent: '#52756a' }, ...added]); setUrl('') }}><Link2 size={17} /><input type="url" required placeholder="Paste an article, video, post, or any URL" value={url} onChange={(event) => setUrl(event.target.value)} /><button>Add</button></form>
    </section>
    <section className="resource-list"><div className="section-title"><h2>Resources <span>{added.length}</span></h2><button>Recently added <ChevronDown size={14} /></button></div>
      {added.map((resource) => <article className="resource-card deep-link-target" id={resource.id} key={resource.id}>
        <div className="resource-thumb" style={{ '--resource-accent': resource.accent } as React.CSSProperties}>{resource.kind === 'video' ? <Video /> : resource.kind === 'pdf' ? <FileText /> : resource.kind === 'chat' ? <MessageCircle /> : <File />}</div>
        <div className="resource-info"><span className="resource-kind">{resource.kind}</span><h3>{resource.title}</h3><p>{resource.meta}</p></div>
        <div className="resource-actions"><CopyLinkButton target={resource.id} /><IconButton label="Resource options"><MoreHorizontal size={18}/></IconButton></div>
      </article>)}
    </section>
    <Comments />
  </div>
}

function Comments() {
  const [text, setText] = useState('')
  const [items, setItems] = useState(comments)
  const add = () => { if (!text.trim()) return; setItems([...items, { id: `comment-${Date.now()}`, author: 'You', initials: 'YO', time: 'Now', body: text }]); setText('') }
  return <section className="comments-section"><div className="section-title"><h2>Discussion <span>{items.length}</span></h2></div>
    <div className="comment-compose"><Avatar initials="YO" color="ink"/><div><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Add to the discussion…"/><button onClick={add} disabled={!text.trim()}><Send size={14}/> Comment</button></div></div>
    {items.map((comment) => <CommentItem key={comment.id} comment={comment}/>)}</section>
}

function CommentItem({ comment }: { comment: Comment }) {
  return <article className="comment deep-link-target" id={comment.id}><Avatar initials={comment.initials} color="clay"/><div className="comment-body"><div><strong>{comment.author}</strong><time>{comment.time}</time></div><p>{comment.body}</p><div className="comment-actions"><button><Reply size={13}/> Reply</button><CopyLinkButton target={comment.id}/></div>{comment.replies?.map((reply) => <CommentItem key={reply.id} comment={reply}/>)}</div></article>
}
