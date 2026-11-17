import type { ServiceRules } from '@openslots/core'

/** `45 min`, `1 hr`, `90 min`, `24 hr`, `1 week`. */
export function formatMinutes(min: number): string {
  if (min >= 10_080 && min % 10_080 === 0) {
    const weeks = min / 10_080
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
  }
  if (min >= 60 && min % 60 === 0) return `${min / 60} hr`
  return `${min} min`
}

/** `1 day`, `60 days`. */
export function formatDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/**
 * The rule line on a service card (S3), with only the parts that apply:
 * `10 min buffer after · starts every 30 min · 24 hr notice`. Buffers and
 * intervals stay in minutes, as the editor shows them; notice reads in hours.
 */
export function ruleSummary(
  rules: Pick<
    ServiceRules,
    | 'bufferBeforeMin'
    | 'bufferAfterMin'
    | 'startIntervalMin'
    | 'minNoticeMin'
    | 'maxPerDay'
  >,
): string {
  const parts: string[] = []
  const { bufferBeforeMin: before, bufferAfterMin: after } = rules
  if (before > 0 && before === after) {
    parts.push(`${before} min buffer before and after`)
  } else {
    if (before > 0) parts.push(`${before} min buffer before`)
    if (after > 0) parts.push(`${after} min buffer after`)
  }
  parts.push(`starts every ${rules.startIntervalMin} min`)
  if (rules.maxPerDay !== undefined) {
    parts.push(`max ${rules.maxPerDay} per day`)
  }
  if (rules.minNoticeMin > 0) {
    parts.push(`${formatMinutes(rules.minNoticeMin)} notice`)
  }
  return parts.join(' · ')
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * The open weekdays of a schedule, for the "Uses schedule" choice:
 * `Mon to Fri`, `Tue to Sat`, `Mon, Wed, Fri`, `Every day`, `Closed`.
 * Runs of three or more consecutive days (Monday first) are shortened.
 */
export function openDaysSummary(weekly: readonly unknown[][]): string {
  // Monday-first order, as people read a week.
  const order = [1, 2, 3, 4, 5, 6, 0]
  const open = order.filter((d) => (weekly[d]?.length ?? 0) > 0)
  if (open.length === 7) return 'Every day'
  if (open.length === 0) return 'Closed every day'
  const groups: number[][] = []
  for (const d of open) {
    const last = groups[groups.length - 1]
    const prev = last?.[last.length - 1]
    if (
      last &&
      prev !== undefined &&
      order.indexOf(d) === order.indexOf(prev) + 1
    ) {
      last.push(d)
    } else {
      groups.push([d])
    }
  }
  return groups
    .flatMap((g) =>
      g.length >= 3
        ? [`${DAY_SHORT[g[0]!]} to ${DAY_SHORT[g[g.length - 1]!]}`]
        : g.map((d) => DAY_SHORT[d]!),
    )
    .join(', ')
}
