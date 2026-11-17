import { cn } from '@/lib/utils'

/** The OpenSlots mark: four slots, one taken (design spec `.logo-mark`). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-[22px] grid-cols-2 gap-0.5 rounded-md bg-primary p-1',
        className,
      )}
    >
      <i className="rounded-xs bg-primary-foreground" />
      <i className="rounded-xs bg-primary-foreground opacity-45" />
      <i className="rounded-xs bg-accent-strong" />
      <i className="rounded-xs bg-primary-foreground" />
    </span>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex items-center gap-2 text-base font-bold tracking-tight',
        className,
      )}
    >
      <LogoMark />
      OpenSlots
    </span>
  )
}
