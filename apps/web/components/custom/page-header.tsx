import { cn } from '@/lib/utils'

/** Page title block from the design spec (`.page-h`). */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
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
      <div>
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
