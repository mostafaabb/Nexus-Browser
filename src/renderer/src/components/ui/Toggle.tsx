import { cn } from '../../lib/cn'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

/** A switch style checkbox used throughout the settings pages. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled
}: ToggleProps): React.JSX.Element {
  return (
    <label
      className={cn(
        'flex items-start justify-between gap-4 py-1.5',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-subtle">
            {description}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150',
          checked ? 'bg-accent' : 'bg-surface-3 border border-line-strong'
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-transform duration-150',
            checked ? 'translate-x-[16px]' : 'translate-x-[2px]'
          )}
        />
      </button>
    </label>
  )
}
