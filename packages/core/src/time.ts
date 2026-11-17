/**
 * Small, pure time helpers. Calendar dates (`YYYY-MM-DD`) are plain strings
 * with no timezone; instants are `Date`. Timezone offsets come from
 * `@date-fns/tz`, which reads the runtime's `Intl` data, so this works the
 * same in Node and in browsers.
 */
import { tzOffset } from '@date-fns/tz'

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000
const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** True if `value` is a real calendar date written as `YYYY-MM-DD`. */
export function isLocalDate(value: string): boolean {
  const m = LOCAL_DATE_RE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!))
  return d.toISOString().slice(0, 10) === value
}

function dateToUtcMs(date: string): number {
  if (!isLocalDate(date)) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`)
  return Date.parse(`${date}T00:00:00Z`)
}

/** `date` plus `days` calendar days. */
export function addDays(date: string, days: number): string {
  return new Date(dateToUtcMs(date) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateToUtcMs(to) - dateToUtcMs(from)) / MS_PER_DAY)
}

/** Day of the week for a calendar date: 0 is Sunday, 6 is Saturday. */
export function weekday(date: string): number {
  return new Date(dateToUtcMs(date)).getUTCDay()
}

/** Every date from `from` to `to`, inclusive. Empty if `to` is before `from`. */
export function eachDate(from: string, to: string): string[] {
  const n = daysBetween(from, to)
  const out: string[] = []
  for (let i = 0; i <= n; i++) out.push(addDays(from, i))
  return out
}

/** The calendar date of `instant` in `timeZone`. */
export function localDateOf(instant: Date, timeZone: string): string {
  const offset = tzOffset(timeZone, instant)
  return new Date(instant.getTime() + offset * MS_PER_MINUTE)
    .toISOString()
    .slice(0, 10)
}

/**
 * The UTC instant of a wall-clock time in `timeZone`. `minuteOfDay` may be
 * 1440, meaning midnight at the end of `date`.
 *
 * - `'reject'` returns `null` for a wall time that does not exist (inside a
 *   spring-forward gap).
 * - `'later'` maps a nonexistent wall time forward by the size of the gap, as
 *   JavaScript `Date` and `Temporal`'s `compatible` mode do.
 *
 * A wall time that occurs twice (a fall-back overlap) always resolves to the
 * earlier instant.
 */
export function wallTimeToUtc(
  date: string,
  minuteOfDay: number,
  timeZone: string,
  gap: 'reject' | 'later',
): Date | null {
  const wallMs = dateToUtcMs(date) + minuteOfDay * MS_PER_MINUTE
  // The offset in force at any instant within a day of the wall time is one
  // of at most two values; try both and keep the ones that round-trip.
  const offsets = new Set([
    tzOffset(timeZone, new Date(wallMs - MS_PER_DAY)),
    tzOffset(timeZone, new Date(wallMs)),
    tzOffset(timeZone, new Date(wallMs + MS_PER_DAY)),
  ])
  let earliest: number | null = null
  for (const offset of offsets) {
    if (Number.isNaN(offset))
      throw new RangeError(`Unknown timezone: ${timeZone}`)
    const utcMs = wallMs - offset * MS_PER_MINUTE
    if (tzOffset(timeZone, new Date(utcMs)) === offset) {
      if (earliest === null || utcMs < earliest) earliest = utcMs
    }
  }
  if (earliest !== null) return new Date(earliest)
  if (gap === 'reject') return null
  // In a gap: use the offset from before the gap, which lands after it.
  const before = tzOffset(timeZone, new Date(wallMs - MS_PER_DAY))
  return new Date(wallMs - before * MS_PER_MINUTE)
}
