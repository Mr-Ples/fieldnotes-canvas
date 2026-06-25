export type AnnotationReply = string | { id?: string; author: string; authorId?: string; avatar?: string; initials: string; body: string }
export type AnnotationThread = { id: string; anchorId?: string; quote: string; author: string; authorId?: string; avatar?: string; initials: string; time: string; body: string; replies?: AnnotationReply[] }

export const seedAnnotations: AnnotationThread[] = [
  { id: 'annotation-comment-1', anchorId: 'annotation-1', quote: '“what kind of attention does this moment deserve?”', author: 'Mara Chen', initials: 'MC', time: '24m ago', body: 'This framing is strong. It moves the responsibility back to the designer, not the user.' },
  { id: 'annotation-comment-2', anchorId: 'annotation-2', quote: 'The return is as important as the capture.', author: 'Jon Bell', initials: 'JB', time: '1h ago', body: 'Could we connect this to the idea of “resumability” in tools for thought?' },
]
