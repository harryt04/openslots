import {
  Check,
  CirclePause,
  Plus,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Every status in the app goes through this component so that no state is
 * ever shown with color alone (T-5): each one carries an icon, and the two
 * "off" states are struck through as well.
 */
const statuses = {
  confirmed: { label: 'Confirmed', icon: Check, tone: 'ok' },
  connected: { label: 'Connected', icon: Check, tone: 'ok' },
  'extra-day': { label: 'Extra day', icon: Plus, tone: 'ok' },
  rescheduled: { label: 'Rescheduled', icon: RefreshCw, tone: 'neutral' },
  'short-day': { label: 'Short day', icon: null, tone: 'neutral' },
  pending: { label: 'Pending', icon: RefreshCw, tone: 'neutral' },
  'needs-reconnect': {
    label: 'Needs reconnect',
    icon: TriangleAlert,
    tone: 'warn',
  },
  paused: { label: 'Paused', icon: CirclePause, tone: 'off' },
  cancelled: { label: 'Cancelled', icon: null, tone: 'off' },
  closed: { label: 'Closed', icon: null, tone: 'off' },
} as const satisfies Record<
  string,
  { label: string; icon: LucideIcon | null; tone: keyof typeof tones }
>

const tones = {
  ok: 'bg-primary-soft text-foreground border-transparent',
  neutral: 'bg-card text-foreground border-border',
  warn: 'bg-highlight text-highlight-foreground border-transparent',
  off: 'bg-muted text-muted-foreground border-border line-through',
} as const

export type Status = keyof typeof statuses

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: Status
  /** Overrides the default wording; the icon and decoration stay. */
  label?: string
  className?: string
}) {
  const { label: defaultLabel, icon: Icon, tone } = statuses[status]
  return (
    <Badge
      variant="outline"
      data-status={status}
      className={cn('rounded-full font-medium', tones[tone], className)}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      {label ?? defaultLabel}
    </Badge>
  )
}
