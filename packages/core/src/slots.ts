/**
 * The slot engine (docs/TRD.md section 4). Pure: no I/O, no clock.
 */
import type { Interval, Schedule, ServiceRules, TimeRange } from './schemas'
import { addDays, eachDate, localDateOf, wallTimeToUtc, weekday } from './time'

const MS_PER_MINUTE = 60_000

export interface ComputeSlotsInput {
  service: ServiceRules
  /** Weekly hours and overrides, with the schedule's timezone. */
  schedule: Schedule
  /** UTC. Calendar busy times and existing bookings including their buffers. */
  busy: Interval[]
  /** Bookings already made, keyed by schedule-local date, for `maxPerDay`. */
  bookedCountByDate: Record<string, number>
  /** Schedule-local dates, inclusive. */
  range: { from: string; to: string }
  now: Date
}

/**
 * Open start instants, keyed by schedule-local date. Every date in `range`
 * is a key, with an empty list when nothing is open. Each list holds UTC ISO
 * strings (`2026-12-02T16:00:00.000Z`) in ascending order.
 */
export type SlotsByDate = Record<string, string[]>

/** The ranges that apply on `date`: the override if one exists, else the weekday's. */
export function rangesForDate(schedule: Schedule, date: string): TimeRange[] {
  const override = schedule.overrides.find((o) => o.date === date)
  if (override) return override.ranges
  return schedule.weekly[weekday(date)] ?? []
}

function overlapsAny(
  startMs: number,
  endMs: number,
  busy: Interval[],
): boolean {
  for (const b of busy) {
    if (startMs < b.end.getTime() && b.start.getTime() < endMs) return true
  }
  return false
}

export function computeSlots(input: ComputeSlotsInput): SlotsByDate {
  const { service, schedule, busy, bookedCountByDate, range, now } = input
  const tz = schedule.timezone
  const earliestMs = now.getTime() + service.minNoticeMin * MS_PER_MINUTE
  const lastDate = addDays(localDateOf(now, tz), service.windowDays)
  const durationMs = service.durationMin * MS_PER_MINUTE
  const beforeMs = service.bufferBeforeMin * MS_PER_MINUTE
  const afterMs = service.bufferAfterMin * MS_PER_MINUTE

  const result: SlotsByDate = {}
  for (const date of eachDate(range.from, range.to)) {
    const starts: number[] = []
    result[date] = []

    // Rule 7: a day that has reached its cap offers nothing.
    if (
      service.maxPerDay !== undefined &&
      (bookedCountByDate[date] ?? 0) >= service.maxPerDay
    ) {
      continue
    }
    // Rule 6, window half: dates after now + windowDays offer nothing.
    if (date > lastDate) continue

    // Rule 1: override ranges, else the weekday's.
    for (const r of rangesForDate(schedule, date)) {
      // Rule 2: the range end in wall-clock time. A nonexistent end time
      // moves forward past the gap.
      const rangeEnd = wallTimeToUtc(date, r.endMin, tz, 'later')
      if (!rangeEnd) continue
      const rangeEndMs = rangeEnd.getTime()

      // Rule 3: step through wall-clock start times.
      for (let m = r.startMin; m < r.endMin; m += service.startIntervalMin) {
        // Rule 2: a start time that does not exist on this date is skipped.
        const start = wallTimeToUtc(date, m, tz, 'reject')
        if (!start) continue
        const startMs = start.getTime()
        // Rule 4: the service itself must end within the range.
        if (startMs + durationMs > rangeEndMs) continue
        // Rule 5: service plus buffers must not overlap anything busy.
        if (
          overlapsAny(startMs - beforeMs, startMs + durationMs + afterMs, busy)
        ) {
          continue
        }
        // Rule 6, notice half.
        if (startMs < earliestMs) continue
        starts.push(startMs)
      }
    }

    starts.sort((a, b) => a - b)
    result[date] = [...new Set(starts)].map((ms) => new Date(ms).toISOString())
  }
  return result
}

/**
 * Regroups slots by calendar date in `timeZone` (the customer's), as the
 * public API returns them. Only dates with at least one slot appear. Pass
 * `range` to keep only those dates, inclusive: a server asked for customer
 * dates `from`..`to` computes the schedule dates given by
 * `scheduleRangeFor` and trims here.
 */
/**
 * The schedule-local dates to compute so that every slot falling on the
 * customer's dates `from`..`to` is found, whatever the two timezones are.
 *
 * Two days either side, not one: zones can be more than 24 hours apart
 * (Pacific/Kiritimati is UTC+14, Pacific/Pago_Pago is UTC-11), so a customer's
 * date can reach into the schedule date two days away.
 */
export function scheduleRangeFor(customerRange: { from: string; to: string }): {
  from: string
  to: string
} {
  return {
    from: addDays(customerRange.from, -2),
    to: addDays(customerRange.to, 2),
  }
}

export function groupSlotsByDate(
  slots: SlotsByDate,
  timeZone: string,
  range?: { from: string; to: string },
): SlotsByDate {
  const all = Object.values(slots)
    .flat()
    .sort((a, b) => Date.parse(a) - Date.parse(b))
  const out: SlotsByDate = {}
  for (const iso of all) {
    const date = localDateOf(new Date(iso), timeZone)
    if (range && (date < range.from || date > range.to)) continue
    const list = (out[date] ??= [])
    if (list[list.length - 1] !== iso) list.push(iso)
  }
  return out
}
