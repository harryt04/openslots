import type { ReactNode } from 'react'

import { Icon, Spinner, type IconName } from './icons'
import { cx } from './root'

/*
 * Class strings are written out in full so the Tailwind build can find them.
 * Every interactive element is at least 38px tall (S9-3) and gets the 2px
 * ring from the scoped base styles (T-6).
 */
const buttonBase =
  'os:inline-flex os:items-center os:justify-center os:gap-2 os:min-h-[38px] os:px-3.5 os:rounded-md os:border os:text-sm os:font-medium os:whitespace-nowrap os:no-underline os:transition-colors os:disabled:opacity-60 os:aria-disabled:opacity-60'

export const button = {
  primary: `${buttonBase} os:border-transparent os:bg-primary os:text-primary-foreground os:hover:bg-primary/90`,
  accent: `${buttonBase} os:border-transparent os:bg-accent os:text-accent-foreground os:hover:bg-accent/90`,
  outline: `${buttonBase} os:bg-card os:text-foreground os:border-border os:hover:bg-primary-soft`,
  ghost: `${buttonBase} os:border-transparent os:bg-transparent os:text-foreground os:hover:bg-muted`,
  large: 'os:min-h-[44px] os:px-5 os:text-base',
  icon: 'os:w-[38px] os:px-0',
}

export function Notice({
  tone,
  children,
  action,
  live = 'polite',
}: {
  tone: 'error' | 'warning' | 'info'
  children: ReactNode
  action?: ReactNode
  live?: 'polite' | 'assertive' | 'off'
}) {
  const icon: IconName =
    tone === 'error' ? 'alert' : tone === 'warning' ? 'warning' : 'calendar'
  return (
    <div
      role={
        live === 'assertive'
          ? 'alert'
          : live === 'polite'
            ? 'status'
            : undefined
      }
      className={cx(
        'os:flex os:gap-2.5 os:items-start os:rounded-lg os:border os:p-3 os:text-sm os:text-foreground',
        tone === 'error' && 'os:border-destructive os:bg-card',
        tone === 'warning' && 'os:border-accent os:bg-accent-soft',
        tone === 'info' && 'os:border-border os:bg-muted',
      )}
    >
      <span
        className={cx(
          'os:mt-0.5',
          tone === 'error' ? 'os:text-destructive' : 'os:text-foreground',
        )}
      >
        <Icon name={icon} />
      </span>
      <div className="os:grid os:gap-2 os:flex-1">
        <div>{children}</div>
        {action ? <div>{action}</div> : null}
      </div>
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p
      role="status"
      className="os:flex os:items-center os:gap-2 os:text-sm os:text-muted-foreground os:py-2"
    >
      <Spinner />
      <span>{label}</span>
    </p>
  )
}

/** Visually hidden text for screen readers. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return (
    <span className="os:absolute os:w-px os:h-px os:p-0 os:-m-px os:overflow-hidden os:whitespace-nowrap os:border-0 os:[clip:rect(0,0,0,0)]">
      {children}
    </span>
  )
}

/** The business's initials in a tile, as in the spec. */
export function BusinessMark({ name }: { name: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '·'
  return (
    <span
      aria-hidden="true"
      className="os:inline-grid os:place-items-center os:w-7 os:h-7 os:rounded-[7px] os:bg-primary os:text-primary-foreground os:text-[11px] os:font-bold os:flex-none"
    >
      {initials}
    </span>
  )
}

/** The four-step progress bar (S8-1), with its position in words too. */
export function Steps({
  current,
  total = 4,
}: {
  current: number
  total?: number
}) {
  return (
    <div className="os:mb-3.5">
      <div className="os:flex os:gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i
            key={i}
            className={cx(
              'os:block os:h-1 os:flex-1 os:rounded-sm',
              i <= current ? 'os:bg-primary' : 'os:bg-border',
            )}
          />
        ))}
      </div>
      <p className="os:mt-1.5 os:text-xs os:text-muted-foreground">
        Step {current + 1} of {total}
      </p>
    </div>
  )
}
