/**
 * Display helpers. Calendar dates are `YYYY-MM-DD` strings with no timezone
 * and months are `YYYY-MM`; instants are ISO strings from the API. All
 * formatting goes through `Intl` with an explicit `timeZone`, so the result
 * does not depend on the device's own zone.
 */
import { addDays, isIanaTimeZone, localDateOf, weekday } from '@openslots/core'

export { addDays, localDateOf, weekday }

/** The device's timezone, or UTC if the runtime does not say. */
export function detectTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && isIanaTimeZone(tz)) return tz
  } catch {
    // fall through
  }
  return 'UTC'
}

export function todayIn(timeZone: string, now = new Date()): string {
  return localDateOf(now, timeZone)
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function firstOfMonth(month: string): string {
  return `${month}-01`
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function lastOfMonth(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

/** The same day of the month `n` months away, clamped to that month's end. */
export function addMonthsToDate(date: string, n: number): string {
  const month = addMonths(monthOf(date), n)
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(month))
  return `${month}-${String(day).padStart(2, '0')}`
}

/** A calendar date as a Date at noon UTC, for formatting with `timeZone: 'UTC'`. */
function dateAsUtc(date: string): Date {
  return new Date(`${date}T12:00:00Z`)
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(key: string, options: Intl.DateTimeFormatOptions) {
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, options)
    formatters.set(key, f)
  }
  return f
}

/** "December 2026". */
export function formatMonth(month: string): string {
  return formatter('month', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dateAsUtc(firstOfMonth(month)))
}

/** "Thursday, December 3, 2026". */
export function formatDateLong(date: string): string {
  return formatter('dateLong', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dateAsUtc(date))
}

/** "Thu, Dec 3". */
export function formatDateShort(date: string): string {
  return formatter('dateShort', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dateAsUtc(date))
}

/** "Sun", "Mon", … for weekday 0 to 6. */
export function weekdayShort(day: number): string {
  // 2026-11-01 is a Sunday.
  return formatter('wdShort', { weekday: 'short', timeZone: 'UTC' }).format(
    dateAsUtc(`2026-11-0${day + 1}`),
  )
}

export function weekdayLong(day: number): string {
  return formatter('wdLong', { weekday: 'long', timeZone: 'UTC' }).format(
    dateAsUtc(`2026-11-0${day + 1}`),
  )
}

/** "2:30 PM" for an instant in `timeZone`. */
export function formatTime(iso: string, timeZone: string): string {
  return formatter(`time:${timeZone}`, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso))
}

/** "2:30 – 3:30 PM" style range, using the locale's range format. */
export function formatTimeRange(
  startIso: string,
  endIso: string,
  timeZone: string,
): string {
  const f = formatter(`time:${timeZone}`, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
  const start = new Date(startIso)
  const end = new Date(endIso)
  return typeof f.formatRange === 'function'
    ? f.formatRange(start, end)
    : `${f.format(start)} – ${f.format(end)}`
}

/** "Mountain Time" for `America/Denver`; the IANA name if Intl has none. */
export function timeZoneLabel(timeZone: string, at = new Date()): string {
  if (timeZone === 'UTC') return 'UTC'
  for (const timeZoneName of ['longGeneric', 'long'] as const) {
    try {
      const part = formatter(`tz:${timeZoneName}:${timeZone}`, {
        timeZone,
        timeZoneName,
      })
        .formatToParts(at)
        .find((p) => p.type === 'timeZoneName')?.value
      if (part && !/^GMT[+-]/.test(part)) return part
    } catch {
      // older runtimes reject longGeneric
    }
  }
  return timeZone.replace(/_/g, ' ')
}

let zoneList: string[] | undefined

/** Every IANA zone the runtime knows, plus any `extra`, sorted. */
export function listTimeZones(extra: string[] = []): string[] {
  if (!zoneList) {
    let zones: string[] = []
    try {
      const intl = Intl as unknown as {
        supportedValuesOf?: (key: 'timeZone') => string[]
      }
      zones = intl.supportedValuesOf?.('timeZone') ?? []
    } catch {
      zones = []
    }
    zoneList = zones
  }
  return [...new Set([...zoneList, 'UTC', ...extra])].sort()
}
