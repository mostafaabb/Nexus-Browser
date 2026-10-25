import { forwardRef } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from 'react'
import { cn } from '../../lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...rest },
  ref
): React.JSX.Element {
  return (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded-md border border-line bg-surface-2 px-2.5 text-[13px] text-ink',
        'placeholder:text-ink-subtle transition-colors duration-100',
        'hover:border-line-strong focus:border-accent focus:outline-none',
        invalid && 'border-danger focus:border-danger',
        className
      )}
      {...rest}
    />
  )
})

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export function TextArea({ className, invalid, ...rest }: TextAreaProps): React.JSX.Element {
  return (
    <textarea
      className={cn(
        'w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[13px] leading-relaxed text-ink',
        'placeholder:text-ink-subtle transition-colors duration-100',
        'hover:border-line-strong focus:border-accent focus:outline-none resize-y',
        invalid && 'border-danger focus:border-danger',
        className
      )}
      {...rest}
    />
  )
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children?: ReactNode
}

export function Select({ className, children, ...rest }: SelectProps): React.JSX.Element {
  return (
    <select
      className={cn(
        'h-8 w-full appearance-none rounded-md border border-line bg-surface-2 px-2.5 pr-7 text-[13px] text-ink',
        'transition-colors duration-100 hover:border-line-strong focus:border-accent focus:outline-none',
        'bg-[length:11px] bg-[right_0.6rem_center] bg-no-repeat',
        className
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='%239aa4b8' d='M2.5 4.5 6 8l3.5-3.5z'/%3E%3C/svg%3E\")"
      }}
      {...rest}
    >
      {children}
    </select>
  )
}

export interface LabelProps {
  children: ReactNode
  htmlFor?: string
  hint?: string
  className?: string
}

export function Label({ children, htmlFor, hint, className }: LabelProps): React.JSX.Element {
  return (
    <label
      className={cn('mb-1 flex items-baseline justify-between gap-2', className)}
      htmlFor={htmlFor}
    >
      <span className="text-[12px] font-medium text-ink-muted">{children}</span>
      {hint ? <span className="text-[11px] text-ink-subtle">{hint}</span> : null}
    </label>
  )
}
