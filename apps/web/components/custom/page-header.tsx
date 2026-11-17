import { cn } from '@/lib/utils'

/** Page title block from the design spec (`.page-h`). */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: string
  /** A small line above the title, such as a breadcrumb. */
  eyebrow?: React.ReactNode
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mb-5 flex flex-wrap items-start justify-between gap-4',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-xs text-muted-foreground">{eyebrow}</div>
        ) : null}
        <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  )
}
