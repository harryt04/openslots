import { BLOCK_MINUTES, MINUTES_PER_DAY } from '@openslots/core'

/** `9:00 AM`, `12:30 PM`, `12:00 AM`. 1440 (end of day) reads as `12:00 AM`. */
export function formatTime(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hour24 = Math.floor(m / 60)
  const minute = m % 60
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}`
}

export function formatRange(range: {
  startMin: number
  endMin: number
}): string {
  return `${formatTime(range.startMin)} – ${formatTime(range.endMin)}`
}

export function formatRanges(
  ranges: { startMin: number; endMin: number }[],
): string {
  return [...ranges]
    .sort((a, b) => a.startMin - b.startMin)
    .map(formatRange)
    .join(', ')
}

export type ParsedTime = { ok: true; minutes: number } | { ok: false }

/**
 * Reads what a person types into a time field: `9`, `9:30`, `9am`,
 * `9:30 pm`, `0930`, `17:00`, `noon`. With `asEnd`, midnight (`12 AM`,
 * `0:00`, `24:00`) means the end of the day (1440). The result is minutes
 * after midnight; it is not checked against the 5 minute grid here, so the
 * shared zod schema can report that rule in one place.
 */
export function parseTime(text: string, asEnd = false): ParsedTime {
  const s = text.trim().toLowerCase().replace(/\./g, '')
  if (s === 'noon') return { ok: true, minutes: 12 * 60 }
  if (s === 'midnight') return { ok: true, minutes: asEnd ? 1440 : 0 }
  const match = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/.exec(s)
  if (!match) return { ok: false }
  let hour = Number(match[1])
  const minute = match[2] === undefined ? 0 : Number(match[2])
  const suffix = match[3]
  if (minute > 59) return { ok: false }
  if (suffix) {
    if (hour < 1 || hour > 12) return { ok: false }
    hour = (hour % 12) + (suffix.startsWith('p') ? 12 : 0)
  } else if (hour === 24 && minute === 0) {
    return { ok: true, minutes: 1440 }
  } else if (hour > 23) {
    return { ok: false }
  }
  let minutes = hour * 60 + minute
  if (asEnd && minutes === 0) minutes = MINUTES_PER_DAY
  return { ok: true, minutes }
}

export const TIME_HINT = `Enter a time such as 9:00 AM, in ${BLOCK_MINUTES} minute steps.`

/** A schedule-local `YYYY-MM-DD` read as a plain calendar date. */
function utcDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}

/** `Thu, Dec 24`, with the year when it is not `currentYear`. */
export function formatDate(date: string, currentYear?: number): string {
  const d = utcDate(date)
  const withYear =
    currentYear !== undefined && d.getUTCFullYear() !== currentYear
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  })
}

/** A date picker's local-midnight `Date` for a `YYYY-MM-DD`. */
export function dateFromLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

export function localDateFromDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/** `America/Denver (Mountain Time)`. Falls back to the bare name. */
export function timeZoneLabel(zone: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'longGeneric',
    })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')
    return part ? `${zone} (${part.value})` : zone
  } catch {
    return zone
  }
}

export function timeZoneOptions(selected: string): string[] {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    zones = []
  }
  if (!zones.includes('UTC')) zones = ['UTC', ...zones]
  return zones.includes(selected) ? zones : [selected, ...zones]
}
