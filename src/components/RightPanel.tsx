import { useState } from 'react'
import { ExternalLink, MessageSquareText, MoreHorizontal, Plus, Send } from 'lucide-react'
import { Avatar, CopyLinkButton, IconButton, TabButton } from './Primitives'

export default function RightPanel() {
  const [tab, setTab] = useState<'annotations' | 'discord'>('annotations')
  return <aside className="side-panel right-panel">
    <div className="panel-tabs" role="tablist"><TabButton active={tab === 'annotations'} onClick={() => setTab('annotations')}>Annotations <span className="count">2</span></TabButton><TabButton active={tab === 'discord'} onClick={() => setTab('discord')}>Discord</TabButton></div>
    {tab === 'annotations' ? <Annotations /> : <Discord />}
  </aside>
}

function Annotations() {
  const [reply, setReply] = useState('')
  return <div className="annotations">
    <div className="annotation-intro"><MessageSquareText size={17}/><p>Select text in your notes to start a conversation.</p></div>
    <article className="annotation-card annotation-offset-1" id="annotation-comment-1">
      <div className="annotation-quote">“what kind of attention does this moment deserve?”</div>
      <div className="annotation-meta"><Avatar initials="MC" color="sage"/><div><strong>Mara Chen</strong><time>24m ago</time></div><IconButton label="Annotation options"><MoreHorizontal size={16}/></IconButton></div>
      <p>This framing is strong. It moves the responsibility back to the designer, not the user.</p>
      <div className="annotation-footer"><button>Reply</button><CopyLinkButton target="annotation-comment-1"/></div>
    </article>
    <article className="annotation-card annotation-offset-2" id="annotation-comment-2">
      <div className="annotation-quote">“The return is as important as the capture.”</div>
      <div className="annotation-meta"><Avatar initials="JB" color="clay"/><div><strong>Jon Bell</strong><time>1h ago</time></div><IconButton label="Annotation options"><MoreHorizontal size={16}/></IconButton></div>
      <p>Could we connect this to the idea of “resumability” in tools for thought?</p>
      <div className="inline-reply"><input aria-label="Reply to annotation" placeholder="Reply…" value={reply} onChange={(event) => setReply(event.target.value)}/><button aria-label="Send reply" disabled={!reply}><Send size={13}/></button></div>
    </article>
    <button className="new-annotation"><Plus size={15}/> New annotation</button>
  </div>
}

function Discord() {
  return <div className="discord-panel"><div className="discord-orb">#</div><h3>Canvas conversation</h3><p>This canvas has a dedicated Discord channel for real-time discussion and file sharing.</p><div className="discord-preview"><span># designing-for-attention</span><small>Titan Embeds will load here once configured.</small></div><a href="https://discord.com" target="_blank" rel="noreferrer">Open in Discord <ExternalLink size={14}/></a></div>
}
