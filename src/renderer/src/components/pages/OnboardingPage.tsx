import { Check, Lock, ShieldCheck, Sparkles, Terminal } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { Button } from '../ui/Button'

const STEPS = [
  {
    icon: Sparkles,
    title: 'A browser with an assistant built in',
    body: 'Nexus renders real websites with Chromium and adds an assistant that can read the page you are looking at — and nothing else.'
  },
  {
    icon: Lock,
    title: 'Local first',
    body: 'History, bookmarks, downloads and conversations live in a SQLite database on this machine. There is no account and no sync service.'
  },
  {
    icon: ShieldCheck,
    title: 'Hardened by default',
    body: 'The renderer runs sandboxed with context isolation, websites never get Node.js, and navigation to dangerous protocols is blocked.'
  },
  {
    icon: Terminal,
    title: 'Tools for the work',
    body: 'A snippet library, a local HTTP client, workspaces, split view, per-site permissions and a full developer page live next to your tabs.'
  }
]

/** Shown once on the first launch. */
export function OnboardingPage(): React.JSX.Element {
  const updateSettings = useAppStore((state) => state.updateSettings)

  const finish = async (): Promise<void> => {
    await updateSettings({ onboardingCompleted: true })
  }

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-bg px-6 py-10">
      <div className="w-full max-w-2xl">
        <span
          className="mb-6 grid h-12 w-12 place-items-center rounded-2xl text-xl font-bold text-accent-contrast"
          style={{ background: 'var(--nx-accent)' }}
          aria-hidden="true"
        >
          N
        </span>
        <h1 className="mb-2 text-[24px] font-semibold tracking-tight text-ink">
          Welcome to Nexus Browser
        </h1>
        <p className="mb-8 text-[13px] leading-relaxed text-ink-muted">
          A desktop browser for people who read the web carefully. Everything below is optional —
          you can change all of it later in Settings.
        </p>

        <ul className="mb-8 grid gap-3 sm:grid-cols-2">
          {STEPS.map((step) => {
            const Icon = step.icon
            return (
              <li key={step.title} className="rounded-xl border border-line bg-surface p-4">
                <Icon className="mb-2 h-5 w-5 text-accent" />
                <h2 className="mb-1 text-[13px] font-semibold text-ink">{step.title}</h2>
                <p className="text-[12px] leading-relaxed text-ink-muted">{step.body}</p>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" onClick={() => void finish()}>
            <Check className="h-4 w-4" />
            Start browsing
          </Button>
          <p className="text-[11.5px] text-ink-subtle">
            This page is shown once. Reopen it from Settings → Startup.
          </p>
        </div>
      </div>
    </div>
  )
}
