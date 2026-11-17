import { scheduleSchema, type ScheduleInput } from '@openslots/core'

/** One problem, keyed by where it is, e.g. `weekly.4.1.endMin` or `name`. */
export type FieldErrors = Record<string, string>

export type ValidationResult =
  { ok: true; data: ScheduleInput } | { ok: false; errors: FieldErrors }

/**
 * Validates a schedule with the shared `scheduleSchema` and keys each issue by
 * its path, so the form can show it beside the right row. Used by the server
 * (the authority) and by the form for instant feedback.
 */
export function validateSchedule(raw: unknown): ValidationResult {
  const parsed = scheduleSchema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }
  const errors: FieldErrors = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.') || 'form'
    errors[key] ??= issue.message
  }
  return { ok: false, errors }
}
