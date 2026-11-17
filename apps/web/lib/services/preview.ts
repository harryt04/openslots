/**
 * Turns the service editor's current values into a `computeSlots` call for
 * the live preview (S4-3). Nothing here decides availability: the engine in
 * `@openslots/core` does, exactly as the public API will.
 */
import {
  addDays,
  computeSlots,
  localDateOf,
  rangesForDate,
  serviceRulesSchema,
  wallTimeToUtc,
  type ComputeSlotsInput,
  type Interval,
  type Schedule,
  type ServiceRules,
  type TimeRange,
} from '@openslots/core'

const MS_PER_MINUTE = 60_000
/** Look this many days ahead for an open day before giving up. */
const SEARCH_DAYS = 366

/**
 * The first date the schedule is open that lies wholly beyond the minimum
 * notice: strictly after the schedule-local date of `now + minNotice`. Null
 * when the schedule has no open day in the next year.
 */
export function previewDate(
  schedule: Schedule,
  now: Date,
  minNoticeMin: number,
): string | null {
  const earliest = new Date(now.getTime() + minNoticeMin * MS_PER_MINUTE)
  const first = localDateOf(earliest, schedule.timezone)
  for (let i = 1; i <= SEARCH_DAYS; i++) {
    const date = addDays(first, i)
    if (rangesForDate(schedule, date).length > 0) return date
  }
  return null
}

/**
 * One illustrative busy hour on `date`, standing in for a Google event until
 * real calendars are connected (slices 2C and 3A): the whole hour that holds
 * the middle of the day's longest range, clipped to that range. For 9:00 to
 * 18:00 that is 13:00 to 14:00, as in the spec.
 */
export function exampleBusyRange(ranges: TimeRange[]): TimeRange | null {
  const longest = [...ranges].sort(
    (a, b) => b.endMin - b.startMin - (a.endMin - a.startMin),
  )[0]
  if (!longest) return null
  const middle = (longest.startMin + longest.endMin) / 2
  const startMin = Math.max(longest.startMin, Math.floor(middle / 60) * 60)
  const endMin = Math.min(longest.endMin, startMin + 60)
  return startMin < endMin ? { startMin, endMin } : null
}

/** A wall-clock range on `date` in `timeZone` as a UTC interval. */
export function rangeToInterval(
  date: string,
  range: TimeRange,
  timeZone: string,
): Interval | null {
  const start = wallTimeToUtc(date, range.startMin, timeZone, 'later')
  const end = wallTimeToUtc(date, range.endMin, timeZone, 'later')
  return start && end && start < end ? { start, end } : null
}

/** The rule fields of the form, validated by the core schema, or null. */
export function rulesFromForm(values: unknown): ServiceRules | null {
  const parsed = serviceRulesSchema.safeParse(values)
  return parsed.success ? parsed.data : null
}

/**
 * The `computeSlots` input for one preview day. `bookedCountByDate` is empty
 * because the preview shows a day with no bookings yet.
 */
export function buildPreviewInput({
  rules,
  schedule,
  date,
  now,
  busy,
}: {
  rules: ServiceRules
  schedule: Schedule
  date: string
  now: Date
  busy: Interval[]
}): ComputeSlotsInput {
  return {
    service: rules,
    schedule,
    busy,
    bookedCountByDate: {},
    range: { from: date, to: date },
    now,
  }
}

export type Preview =
  | { kind: 'invalid' }
  | { kind: 'closed' }
  | {
      kind: 'day'
      date: string
      rules: ServiceRules
      /** The day's working hours, wall-clock minutes. */
      ranges: TimeRange[]
      /** The illustrative busy block, when shown. */
      example: TimeRange | null
      /** Every start the engine returned, UTC ISO, ascending. */
      starts: string[]
      /** True when `date` is after the booking window. */
      beyondWindow: boolean
    }

/** Everything the preview panel draws, from the form's current values. */
export function computePreview({
  values,
  schedule,
  now,
  showExample,
}: {
  values: unknown
  schedule: Schedule
  now: Date
  showExample: boolean
}): Preview {
  const rules = rulesFromForm(values)
  if (!rules) return { kind: 'invalid' }
  const date = previewDate(schedule, now, rules.minNoticeMin)
  if (!date) return { kind: 'closed' }
  const ranges = rangesForDate(schedule, date)
  const example = showExample ? exampleBusyRange(ranges) : null
  const busyInterval = example
    ? rangeToInterval(date, example, schedule.timezone)
    : null
  const slots = computeSlots(
    buildPreviewInput({
      rules,
      schedule,
      date,
      now,
      busy: busyInterval ? [busyInterval] : [],
    }),
  )
  return {
    kind: 'day',
    date,
    rules,
    ranges,
    example,
    starts: slots[date] ?? [],
    beyondWindow:
      date > addDays(localDateOf(now, schedule.timezone), rules.windowDays),
  }
}

/** Minutes after local midnight of an instant in `timeZone`. */
export function minuteOfDay(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  return get('hour') * 60 + get('minute')
}

/** `9:00 AM`, for a wall-clock minute of the day. */
export function formatClock(minute: number): string {
  const h = Math.floor(minute / 60) % 24
  const m = minute % 60
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** `9 AM`, `12:30 PM`: the short form used on the time axis. */
export function formatClockShort(minute: number): string {
  const full = formatClock(minute)
  return full.replace(':00 ', ' ')
}

/** `Wed, Dec 2` for a `YYYY-MM-DD` date. */
export function formatPreviewDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}
