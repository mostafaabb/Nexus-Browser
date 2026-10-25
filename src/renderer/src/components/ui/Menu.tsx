import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  hint?: string
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
  onSelect: () => void
}

export interface MenuProps {
  items: MenuItem[]
  x: number
  y: number
  onClose: () => void
}

/** A small, self contained context menu rendered in a portal. */
export function Menu({ items, x, y, onClose }: MenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    let left = x
    let top = y
    if (left + rect.width > window.innerWidth - 8)
      left = Math.max(8, window.innerWidth - rect.width - 8)
    if (top + rect.height > window.innerHeight - 8) top = Math.max(8, y - rect.height)
    setPosition({ left, top })
  }, [x, y])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[100] min-w-[190px] overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-2xl shadow-black/50"
      style={{ left: position.left, top: position.top }}
    >
      {items.map((item) => (
        <div key={item.id}>
          {item.separatorBefore ? <div className="my-1 h-px bg-line" /> : null}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors',
              'disabled:pointer-events-none disabled:opacity-40',
              item.danger ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-surface-2'
            )}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            {item.icon ? <span className="text-ink-subtle">{item.icon}</span> : null}
            <span className="flex-1 truncate">{item.label}</span>
            {item.hint ? <span className="text-[11px] text-ink-subtle">{item.hint}</span> : null}
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}
