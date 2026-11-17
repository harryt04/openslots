import { serviceSchema } from '@openslots/core'
import type { z } from 'zod'

/**
 * What the service editor (S4) submits. The rules themselves are
 * `serviceSchema` from `@openslots/core`; the slug is derived from the name
 * on the server and `active` is changed only by the pause switch, so both
 * are left out here.
 */
export const serviceFormSchema = serviceSchema.omit({
  slug: true,
  active: true,
})
export type ServiceFormValues = z.infer<typeof serviceFormSchema>

type FieldName = keyof ServiceFormValues

const LABELS: Partial<Record<FieldName, string>> = {
  name: 'name',
  description: 'description',
  durationMin: 'duration',
  bufferBeforeMin: 'buffer',
  bufferAfterMin: 'buffer',
  startIntervalMin: 'start interval',
  minNoticeMin: 'minimum notice',
  windowDays: 'booking window',
  maxPerDay: 'daily limit',
}

type Issue = {
  code?: string
  path?: PropertyKey[]
  minimum?: unknown
  maximum?: unknown
  origin?: string
  input?: unknown
}

/**
 * Plain-language messages for the core schema's issues. Only the wording
 * lives here; the limits still come from `@openslots/core`. Passed to zod as
 * a per-parse error map, so a message the schema sets itself (such as
 * "Must be a multiple of 5 minutes") wins.
 */
export function serviceErrorMessage(issue: Issue): string | undefined {
  const field = issue.path?.[0] as FieldName | undefined
  const label = (field && LABELS[field]) ?? 'value'
  const unit = field === 'windowDays' ? 'days' : 'minutes'
  const isText = issue.origin === 'string'
  switch (issue.code) {
    case 'too_small':
      if (field === 'name') return 'Enter a name.'
      if (isText) return `The ${label} is too short.`
      return field === 'maxPerDay'
        ? `Allow at least ${String(issue.minimum)} booking a day.`
        : `The ${label} must be at least ${String(issue.minimum)} ${unit}.`
    case 'too_big':
      if (isText)
        return `Use at most ${String(issue.maximum)} characters for the ${label}.`
      if (field === 'durationMin') return 'A service can last at most 8 hours.'
      if (field === 'maxPerDay')
        return `Allow at most ${String(issue.maximum)} bookings a day.`
      return `The ${label} can be at most ${String(issue.maximum)} ${unit}.`
    case 'invalid_type':
      if (issue.input === undefined || Number.isNaN(issue.input)) {
        if (field === 'durationMin') return 'Enter a duration in minutes.'
        return `Enter a ${label}.`
      }
      return `Enter a valid ${label}.`
    case 'invalid_value':
      if (field === 'color') return 'Choose a color.'
      return undefined
    default:
      return undefined
  }
}

export const serviceParseOptions = { error: serviceErrorMessage }

/** Result of a service form action: field errors are shown inline. */
export type ServiceActionResult =
  | { ok: true; redirectTo?: string }
  | {
      ok: false
      fieldErrors?: Partial<Record<FieldName, string>>
      message?: string
    }

/** Parses untrusted form input on the server. */
export function parseServiceForm(
  raw: unknown,
):
  | { ok: true; data: ServiceFormValues }
  | { ok: false; fieldErrors: Partial<Record<FieldName, string>> } {
  const parsed = serviceFormSchema.safeParse(raw, serviceParseOptions)
  if (parsed.success) return { ok: true, data: parsed.data }
  const fieldErrors: Partial<Record<FieldName, string>> = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as FieldName
    // The core schema's own wording for a bad id means nothing to an owner
    // picking from a list.
    fieldErrors[key] ??=
      key === 'scheduleId' ? 'Choose a schedule.' : issue.message
  }
  return { ok: false, fieldErrors }
}
