import { useState } from 'react'
import { MessageSquareText, MoreHorizontal, Plus, Send } from 'lucide-react'
import { Avatar, CopyLinkButton, IconButton, TabButton } from './Primitives'
import { useLocalStorage } from '../hooks/useLocalStorage'
import CanvasChat from './CanvasChat'

type Annotation = { id: string; quote: string; author: string; initials: string; time: string; body: string; replies?: string[] }
const seedAnnotations: Annotation[] = [
  { id: 'annotation-comment-1', quote: '“what kind of attention does this moment deserve?”', author: 'Mara Chen', initials: 'MC', time: '24m ago', body: 'This framing is strong. It moves the responsibility back to the designer, not the user.' },
  { id: 'annotation-comment-2', quote: '“The return is as important as the capture.”', author: 'Jon Bell', initials: 'JB', time: '1h ago', body: 'Could we connect this to the idea of “resumability” in tools for thought?' },
]

export default function RightPanel() {
  const [tab, setTab] = useState<'annotations' | 'chat'>('annotations')
  return <aside className="side-panel right-panel">
    <div className="panel-tabs" role="tablist"><TabButton active={tab === 'annotations'} onClick={() => setTab('annotations')}>Annotations <span className="count">2</span></TabButton><TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>Chat · Discord</TabButton></div>
    {tab === 'annotations' ? <Annotations /> : <CanvasChat />}
  </aside>
}

function Annotations() {
  const [reply, setReply] = useState('')
  const [items, setItems] = useLocalStorage('fieldnotes:annotations', seedAnnotations)
  const create = () => {
    const quote = window.getSelection()?.toString().trim() || window.prompt('Text being annotated')?.trim()
    if (!quote) return
    const body = window.prompt('Annotation')?.trim()
    if (!body) return
    const item = { id: `annotation-comment-${crypto.randomUUID()}`, quote, author: 'You', initials: 'YO', time: 'Now', body }
    setItems([...items, item])
    window.location.hash = item.id
  }
  const addReply = (id: string, value?: string) => {
    const body = value?.trim() || window.prompt('Write a reply')?.trim()
    if (!body) return
    setItems(items.map((item) => item.id === id ? { ...item, replies: [...(item.replies ?? []), body] } : item))
    setReply('')
  }
  return <div className="annotations">
    <div className="annotation-intro"><MessageSquareText size={17}/><p>Select text in your notes to start a conversation.</p></div>
    {items.map((item, index) => <article className={`annotation-card ${index === 0 ? 'annotation-offset-1' : index === 1 ? 'annotation-offset-2' : 'mt-4'}`} id={item.id} key={item.id}>
      <div className="annotation-quote">“{item.quote.replaceAll('“', '').replaceAll('”', '')}”</div>
      <div className="annotation-meta"><Avatar initials={item.initials} color={index % 2 ? 'clay' : 'sage'}/><div><strong>{item.author}</strong><time>{item.time}</time></div><IconButton label="Annotation options"><MoreHorizontal size={16}/></IconButton></div>
      <p>{item.body}</p>
      {item.replies?.map((value, replyIndex) => <p className="ml-4 border-l border-stone-300 pl-3" key={`${item.id}-${replyIndex}`}><strong className="mr-1 font-sans text-[9px]">You</strong>{value}</p>)}
      {index === 1 ? <div className="inline-reply"><input aria-label="Reply to annotation" placeholder="Reply…" value={reply} onChange={(event) => setReply(event.target.value)}/><button aria-label="Send reply" disabled={!reply} onClick={() => addReply(item.id, reply)}><Send size={13}/></button></div> : <div className="annotation-footer"><button onClick={() => addReply(item.id)}>Reply</button><CopyLinkButton target={item.id}/></div>}
    </article>)}
    <button className="new-annotation" onClick={create}><Plus size={15}/> New annotation</button>
  </div>
}
