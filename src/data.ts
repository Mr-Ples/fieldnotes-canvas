export type Canvas = { id: string; title: string; subtitle?: string; emoji: string; updated: string; projectId?: string; group?: string }
export type Project = { id: string; title: string }
export type Resource = { id: string; kind: 'article' | 'pdf' | 'video' | 'chat'; title: string; meta: string; accent: string; url?: string; content?: string }
export type Comment = { id: string; author: string; authorId?: string; avatar?: string; initials: string; time: string; body: string; replies?: Comment[] }

export const canvases: Canvas[] = [
  { id: 'attention', title: 'Designing for attention', subtitle: 'Notes on interfaces that protect focus, invite curiosity, and help ideas find each other.', emoji: '✦', updated: 'Now', projectId: 'attention-project' },
  { id: 'slow-web', title: 'The slow web', subtitle: 'Notes on slower patterns for reading, writing, and returning.', emoji: '◌', updated: '2h', projectId: 'attention-project' },
  { id: 'tools-thought', title: 'Tools for thought', subtitle: 'A canvas for working notes about personal knowledge tools.', emoji: '⌁', updated: 'Tue' },
  { id: 'ambient', title: 'Ambient interfaces', subtitle: 'Interface ideas that stay present without getting loud.', emoji: '◇', updated: 'Jun 18', projectId: 'fieldwork' },
  { id: 'field-study', title: 'Field study / Berlin', subtitle: 'Observations, material, and follow-up questions from Berlin research.', emoji: '⌖', updated: 'Jun 12', projectId: 'fieldwork' },
]

export const projects: Project[] = [{ id: 'attention-project', title: 'Attention research' }, { id: 'fieldwork', title: 'Fieldwork' }]

export const resources: Resource[] = [
  { id: 'res-calm', kind: 'article', title: 'Calm technology and the future of attention', meta: 'Article · 12 min read', accent: '#c96e4b' },
  { id: 'res-notebook', kind: 'pdf', title: 'The Dynamic Medium — working notes', meta: 'PDF · 34 pages', accent: '#52756a' },
  { id: 'res-talk', kind: 'video', title: 'Bret Victor: The Humane Representation of Thought', meta: 'Video · 1h 15m', accent: '#876b99' },
  { id: 'res-chat', kind: 'chat', title: 'Chat excerpt: interfaces as environments', meta: 'AI chat · 6 messages', accent: '#b28a3d' },
]

export const comments: Comment[] = [
  { id: 'comment-1', author: 'Mara Chen', initials: 'MC', time: '24m', body: 'The distinction between capturing and returning feels important. Could this become a design principle?', replies: [{ id: 'reply-1', author: 'You', initials: 'YO', time: '8m', body: 'Yes — especially the idea that the system should preserve context, not just content.' }] },
  { id: 'comment-2', author: 'Jon Bell', initials: 'JB', time: '1h', body: 'This connects to the “calm technology” article above. I linked the relevant section.' },
]
