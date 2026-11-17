import type { ReactNode } from 'react'

/** Root class every style in this package is scoped under (design check C-4). */
export const ROOT_CLASS = 'openslots'

/**
 * How the default colors pick light or dark. Tokens a host page defines
 * (`--primary`, …) always win over these defaults.
 *
 * - `auto` (default): dark under an ancestor with class `dark`, as
 *   next-themes and shadcn/ui set it; light otherwise.
 * - `system`: follows the operating system's `prefers-color-scheme`.
 * - `light`, `dark`: forced.
 */
export type Theme = 'auto' | 'system' | 'light' | 'dark'

export interface RootProps {
  theme?: Theme
  className?: string
  children: ReactNode
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** The scoped root every exported component renders. */
export function Root({ theme = 'auto', className, children }: RootProps) {
  return (
    <div className={cx(ROOT_CLASS, className)} data-os-theme={theme}>
      {children}
    </div>
  )
}
