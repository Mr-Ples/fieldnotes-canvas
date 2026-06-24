import CanvasChat from './CanvasChat'

export default function RightPanel() {
  return <aside className="side-panel right-panel">
    <div className="panel-tabs"><span className="panel-title">Chat · Discord</span></div>
    <CanvasChat />
  </aside>
}
