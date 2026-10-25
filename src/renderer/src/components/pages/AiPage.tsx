import { AiPanel } from '../AiPanel'

export function AiPage(): React.JSX.Element {
  return (
    <div className="h-full bg-bg p-4">
      <div className="mx-auto flex h-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line bg-surface">
        <AiPanel />
      </div>
    </div>
  )
}
