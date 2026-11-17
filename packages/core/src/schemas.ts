/**
 * Domain schemas shared by the app, the public API and `@openslots/react`.
 * See docs/TRD.md section 3 for the stored shape and PRD R3, R4 for the rules.
 */
import * as z from 'zod'

import { isLocalDate } from './time'

/** Slot locks, durations, intervals and schedule times align to this many minutes. */
export const BLOCK_MINUTES = 5

/** Duration presets offered in the service editor (S4-1). */
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180] as const
export const MIN_DURATION_MIN = 5
export const MAX_DURATION_MIN = 480
export const MAX_BUFFER_MIN = 240
export const MAX_START_INTERVAL_MIN = 480
/** 30 days. */
export const MAX_MIN_NOTICE_MIN = 43_200
export const MAX_WINDOW_DAYS = 365
export const MAX_PER_DAY = 100
export const MAX_RANGES_PER_DAY = 12
export const MAX_OVERRIDES = 366
export const MINUTES_PER_DAY = 1440

/** Service color token names: the Okabe-Ito set in the design spec. */
export const SERVICE_COLORS = [
  'blue',
  'orange',
  'sky',
  'vermillion',
  'pink',
  'yellow',
] as const

export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled'] as const

/** Field length limits shared by forms and the API. */
export const LIMITS = {
  slug: 64,
  businessName: 100,
  serviceName: 100,
  serviceDescription: 500,
  scheduleName: 100,
  customerName: 100,
  customerEmail: 254,
  customerPhone: 32,
  customerNotes: 1000,
} as const

const fiveMinuteMultiple = (min: number, max: number) =>
  z
    .number()
    .int()
    .min(min)
    .max(max)
    .multipleOf(BLOCK_MINUTES, {
      error: `Must be a multiple of ${BLOCK_MINUTES} minutes`,
    })

// ---------------------------------------------------------------- primitives

/** A calendar date, `YYYY-MM-DD`, with no timezone. */
export const localDateSchema = z
  .string()
  .refine(isLocalDate, { error: 'Must be a date in the form YYYY-MM-DD' })
export type LocalDate = z.infer<typeof localDateSchema>

const IANA_NAME_RE = /^(?:UTC|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+)$/

/** True if `value` is an IANA timezone name this runtime knows. */
export function isIanaTimeZone(value: string): boolean {
  // Modern engines also accept raw offsets such as "+01:00"; the pattern
  // rejects those, because an offset has no daylight saving rules.
  if (!IANA_NAME_RE.test(value)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** An IANA timezone name such as `America/Denver`. */
export const timeZoneSchema = z
  .string()
  .max(64)
  .refine(isIanaTimeZone, { error: 'Must be an IANA timezone name' })

/** Lowercase letters, digits and single hyphens, used in URLs. */
export const slugSchema = z
  .string()
  .min(1)
  .max(LIMITS.slug)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    error: 'Use lowercase letters, numbers and single hyphens',
  })

/** A MongoDB ObjectId as 24 lowercase hex characters. */
export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/, { error: 'Must be an ID' })

export const serviceColorSchema = z.enum(SERVICE_COLORS)
export type ServiceColor = z.infer<typeof serviceColorSchema>

export const bookingStatusSchema = z.enum(BOOKING_STATUSES)
export type BookingStatus = z.infer<typeof bookingStatusSchema>

/** A half-open UTC interval `[start, end)`. */
export const intervalSchema = z
  .object({ start: z.date(), end: z.date() })
  .refine((i) => i.start.getTime() < i.end.getTime(), {
    error: 'Interval must end after it starts',
    path: ['end'],
  })
export type Interval = z.infer<typeof intervalSchema>

// ------------------------------------------------------------------ schedule

/** Minutes after local midnight, `[startMin, endMin)`. `endMin` may be 1440. */
export const timeRangeSchema = z
  .object({
    startMin: fiveMinuteMultiple(0, MINUTES_PER_DAY - BLOCK_MINUTES),
    endMin: fiveMinuteMultiple(BLOCK_MINUTES, MINUTES_PER_DAY),
  })
  .refine((r) => r.startMin < r.endMin, {
    error: 'End time must be after start time',
    path: ['endMin'],
  })
export type TimeRange = z.infer<typeof timeRangeSchema>

/** One day's ranges. Order does not matter; ranges may touch but not overlap. */
export const dayRangesSchema = z
  .array(timeRangeSchema)
  .max(MAX_RANGES_PER_DAY)
  .superRefine((ranges, ctx) => {
    const sorted = [...ranges].sort((a, b) => a.startMin - b.startMin)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.startMin < sorted[i - 1]!.endMin) {
        ctx.addIssue({ code: 'custom', message: 'Time ranges overlap' })
        return
      }
    }
  })

/** A date override. Empty `ranges` closes the day. */
export const scheduleOverrideSchema = z.object({
  date: localDateSchema,
  ranges: dayRangesSchema,
})
export type ScheduleOverride = z.infer<typeof scheduleOverrideSchema>

/**
 * What the slot engine needs from a schedule. `weekly[0]` is Sunday and
 * `weekly[6]` is Saturday, matching `Date.prototype.getDay`.
 */
export const scheduleRulesSchema = z.object({
  timezone: timeZoneSchema,
  weekly: z.tuple([
    dayRangesSchema,
    dayRangesSchema,
    dayRangesSchema,
    dayRangesSchema,
    dayRangesSchema,
    dayRangesSchema,
    dayRangesSchema,
  ]),
  overrides: z
    .array(scheduleOverrideSchema)
    .max(MAX_OVERRIDES)
    .refine((o) => new Set(o.map((x) => x.date)).size === o.length, {
      error: 'Each date can have only one override',
    }),
})
export type Schedule = z.infer<typeof scheduleRulesSchema>

/** A schedule as the admin edits it (S5). */
export const scheduleSchema = scheduleRulesSchema.extend({
  name: z.string().trim().min(1).max(LIMITS.scheduleName),
})
export type ScheduleInput = z.infer<typeof scheduleSchema>

// ------------------------------------------------------------------- service

/** What the slot engine needs from a service. */
export const serviceRulesSchema = z.object({
  durationMin: fiveMinuteMultiple(MIN_DURATION_MIN, MAX_DURATION_MIN),
  bufferBeforeMin: fiveMinuteMultiple(0, MAX_BUFFER_MIN),
  bufferAfterMin: fiveMinuteMultiple(0, MAX_BUFFER_MIN),
  startIntervalMin: fiveMinuteMultiple(BLOCK_MINUTES, MAX_START_INTERVAL_MIN),
  minNoticeMin: z.number().int().min(0).max(MAX_MIN_NOTICE_MIN),
  windowDays: z.number().int().min(1).max(MAX_WINDOW_DAYS),
  maxPerDay: z.number().int().min(1).max(MAX_PER_DAY).optional(),
})
export type ServiceRules = z.infer<typeof serviceRulesSchema>

/** A service as the admin edits it (S4). */
export const serviceSchema = serviceRulesSchema.extend({
  name: z.string().trim().min(1).max(LIMITS.serviceName),
  slug: slugSchema,
  description: z.string().trim().max(LIMITS.serviceDescription),
  color: serviceColorSchema,
  scheduleId: objectIdSchema,
  askPhone: z.boolean(),
  askNotes: z.boolean(),
  active: z.boolean(),
})
export type ServiceInput = z.infer<typeof serviceSchema>

// ------------------------------------------------------------------ customer

/**
 * An optional free-text field. An untouched form input sends an empty string,
 * so blank and whitespace-only values mean "not given" rather than an error.
 */
function optionalText(max: number) {
  return z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().max(max).optional(),
  )
}

/** Customer fields as entered in the booking form. */
export const customerFieldsSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.customerName),
  email: z.email().max(LIMITS.customerEmail),
  phone: optionalText(LIMITS.customerPhone),
  notes: optionalText(LIMITS.customerNotes),
})
export type CustomerFields = z.infer<typeof customerFieldsSchema>

/** Which optional customer fields a service asks for. */
export interface CustomerFieldOptions {
  askPhone: boolean
  askNotes: boolean
}

/**
 * The customer fields for one service (docs/TRD.md section 7): the phone is
 * required when `askPhone` is true, notes are always optional, and a field
 * the service does not ask for is stripped. The booking form and
 * `POST /bookings` both validate with this, so they cannot disagree.
 */
export function customerFieldsFor({
  askPhone,
  askNotes,
}: CustomerFieldOptions): z.ZodType<CustomerFields, unknown> {
  const base = customerFieldsSchema.omit({ phone: true, notes: true })
  return base.extend({
    ...(askPhone
      ? { phone: z.string().trim().min(1).max(LIMITS.customerPhone) }
      : {}),
    ...(askNotes ? { notes: optionalText(LIMITS.customerNotes) } : {}),
  }) as z.ZodType<CustomerFields, unknown>
}

/** Customer as stored on a booking: the form fields plus their timezone. */
export const customerSchema = customerFieldsSchema.extend({
  timezone: timeZoneSchema,
})
export type Customer = z.infer<typeof customerSchema>
