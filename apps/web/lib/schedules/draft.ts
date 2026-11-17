import {
  scheduleOverrideSchema,
  type ScheduleInput,
  type ScheduleOverride,
  type TimeRange,
} from '@openslots/core'

import { formatTime, parseTime, TIME_HINT } from './time'
import {
  validateSchedule,
  type FieldErrors,
  type ValidationResult,
} from './validate'

/**
 * What the form edits: times as the text in the field, so a half-typed value
 * is never lost. It is turned into minutes only to validate and to save.
 */
export type RangeText = { start: string; end: string }
export type ScheduleDraft = {
  name: string
  timezone: string
  weekly: RangeText[][]
  overrides: { date: string; ranges: RangeText[] }[]
}

export type SavedSchedule = {
  name: string
  timezone: string
  weekly: TimeRange[][]
  overrides: ScheduleOverride[]
}

export const rangeToText = (r: TimeRange): RangeText => ({
  start: formatTime(r.startMin),
  end: formatTime(r.endMin),
})

export function toDraft(saved: SavedSchedule): ScheduleDraft {
  return {
    name: saved.name,
    timezone: saved.timezone,
    weekly: saved.weekly.map((day) => day.map(rangeToText)),
    overrides: saved.overrides.map((o) => ({
      date: o.date,
      ranges: o.ranges.map(rangeToText),
    })),
  }
}

/** A new range after the last one, an hour long where it fits. */
export function nextRange(existing: RangeText[]): RangeText {
  const last = existing.at(-1)
  const lastEnd = last ? parseTime(last.end, true) : null
  const start = lastEnd?.ok ? Math.min(lastEnd.minutes + 60, 22 * 60) : 9 * 60
  return {
    start: formatTime(start),
    end: formatTime(Math.min(start + 60, 24 * 60)),
  }
}

/**
 * Converts ranges' text to minutes. A time that cannot be read gets NaN (which
 * the shared schema refuses) and its own message under the schema's key.
 */
export function parseRanges(
  texts: RangeText[],
  prefix: string,
): { ranges: TimeRange[]; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const ranges = texts.map((t, i) => {
    const start = parseTime(t.start)
    const end = parseTime(t.end, true)
    if (!start.ok) errors[`${prefix}.${i}.startMin`] = TIME_HINT
    if (!end.ok) errors[`${prefix}.${i}.endMin`] = TIME_HINT
    return {
      startMin: start.ok ? start.minutes : NaN,
      endMin: end.ok ? end.minutes : NaN,
    }
  })
  return { ranges, errors }
}

export function draftToInput(draft: ScheduleDraft): {
  input: ScheduleInput
  parseErrors: FieldErrors
} {
  const parseErrors: FieldErrors = {}
  const weekly = draft.weekly.map((day, d) => {
    const parsed = parseRanges(day, `weekly.${d}`)
    Object.assign(parseErrors, parsed.errors)
    return parsed.ranges
  })
  const overrides = draft.overrides.map((o, i) => {
    const parsed = parseRanges(o.ranges, `overrides.${i}.ranges`)
    Object.assign(parseErrors, parsed.errors)
    return { date: o.date, ranges: parsed.ranges }
  })
  return {
    input: {
      name: draft.name,
      timezone: draft.timezone,
      weekly: weekly as ScheduleInput['weekly'],
      overrides,
    },
    parseErrors,
  }
}

/** The shared schema's verdict plus a message for each unreadable time. */
export function validateDraft(draft: ScheduleDraft): {
  result: ValidationResult
  errors: FieldErrors
} {
  const { input, parseErrors } = draftToInput(draft)
  const result = validateSchedule(input)
  const errors: FieldErrors = {
    ...(result.ok ? {} : result.errors),
    ...parseErrors,
  }
  return { result, errors }
}

/** True when the draft differs from what is saved, or cannot be read. */
export function isDirty(draft: ScheduleDraft, saved: SavedSchedule): boolean {
  const { input, parseErrors } = draftToInput(draft)
  if (Object.keys(parseErrors).length > 0) return true
  const norm = (s: SavedSchedule | ScheduleInput) =>
    JSON.stringify({
      name: s.name.trim(),
      timezone: s.timezone,
      weekly: s.weekly.map((d) =>
        [...d].sort((a, b) => a.startMin - b.startMin),
      ),
      overrides: [...s.overrides]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((o) => ({
          date: o.date,
          ranges: [...o.ranges].sort((a, b) => a.startMin - b.startMin),
        })),
    })
  return norm(input) !== norm(saved)
}

/** Validates one override in the dialog: a date and its ranges. */
export function validateOverrideDraft(
  date: string | null,
  closed: boolean,
  ranges: RangeText[],
): { errors: FieldErrors; override?: ScheduleOverride } {
  const errors: FieldErrors = {}
  if (!date) errors.date = 'Pick a date.'
  const parsed = parseRanges(closed ? [] : ranges, 'ranges')
  if (!closed && ranges.length === 0) errors.ranges = 'Add a time range.'
  const checked = scheduleOverrideSchema.safeParse({
    date: date ?? '',
    ranges: parsed.ranges,
  })
  if (!checked.success) {
    for (const issue of checked.error.issues) {
      const key = issue.path.join('.')
      if (key !== 'date') errors[key] ??= issue.message
    }
  }
  Object.assign(errors, parsed.errors)
  return Object.keys(errors).length === 0 && checked.success
    ? { errors, override: checked.data }
    : { errors }
}
