import CanvasChat from './CanvasChat'

export function DiscordPanel() {
  return <CanvasChat />
}

export function AnnotationsPanel() {
  return <div className="annotation-dock-target" id="right-panel-annotations" aria-label="Annotations" />
}
