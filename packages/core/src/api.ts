/**
 * Public API v1 payloads (docs/TRD.md section 7). The server (`apps/web`)
 * validates with these and `@openslots/react` parses responses with them, so
 * they are the contract between the two.
 */
import { z } from 'zod'

import {
  bookingStatusSchema,
  customerFieldsSchema,
  localDateSchema,
  objectIdSchema,
  serviceColorSchema,
  slugSchema,
  timeZoneSchema,
} from './schemas'
import { daysBetween } from './time'

/** The most days a single slots request may span (`to − from`). */
export const MAX_SLOT_RANGE_DAYS = 62

/** Header that carries the publishable key. */
export const PUBLISHABLE_KEY_HEADER = 'X-OpenSlots-Key'

/** `os_pk_` followed by base64url characters. */
export const publishableKeySchema = z
  .string()
  .regex(/^os_pk_[A-Za-z0-9_-]{16,128}$/, { error: 'Not a publishable key' })

/** Manage token: 32 random bytes, base64url without padding (43 characters). */
export const manageTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, { error: 'Not a manage token' })

/** A UTC instant in responses, always with `Z`. */
const instantSchema = z.iso.datetime()
/** An instant in requests: `Z` or an explicit offset. */
const instantInputSchema = z.iso.datetime({ offset: true })

// ------------------------------------------------------------------- errors

/** Every error code the API returns, with its HTTP status. */
export const API_ERROR_STATUS = {
  invalid_request: 400,
  invalid_key: 401,
  origin_not_allowed: 403,
  not_found: 404,
  slot_taken: 409,
  booking_not_changeable: 409,
  rate_limited: 429,
  internal_error: 500,
  calendar_unavailable: 502,
} as const

export type ApiErrorCode = keyof typeof API_ERROR_STATUS
export const API_ERROR_CODES = Object.keys(API_ERROR_STATUS) as [
  ApiErrorCode,
  ...ApiErrorCode[],
]

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
  }),
})
export type ApiError = z.infer<typeof apiErrorSchema>

// ------------------------------------------------------------ GET /business

/** A service as the public sees it: no rules beyond what the form needs. */
export const publicServiceSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  slug: slugSchema,
  description: z.string(),
  color: serviceColorSchema,
  durationMin: z.number().int().positive(),
  askPhone: z.boolean(),
  askNotes: z.boolean(),
})
export type PublicService = z.infer<typeof publicServiceSchema>

/** `GET /business`: name, timezone and active services. */
export const businessResponseSchema = z.object({
  name: z.string(),
  slug: slugSchema,
  timezone: timeZoneSchema,
  services: z.array(publicServiceSchema),
})
export type BusinessResponse = z.infer<typeof businessResponseSchema>

// --------------------------------------------------------------- GET /slots

/**
 * `GET /slots?service=&from=&to=&tz=`. `from` and `to` are dates in `tz`, at
 * most 62 days apart. `tz` defaults to the business timezone.
 */
export const slotsQuerySchema = z
  .object({
    service: objectIdSchema,
    from: localDateSchema,
    to: localDateSchema,
    tz: timeZoneSchema.optional(),
  })
  .superRefine((q, ctx) => {
    const span = daysBetween(q.from, q.to)
    if (span < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: '`to` is before `from`',
      })
    } else if (span > MAX_SLOT_RANGE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `At most ${MAX_SLOT_RANGE_DAYS} days apart`,
      })
    }
  })
export type SlotsQuery = z.infer<typeof slotsQuerySchema>

/** Why a slots response is empty when it is not simply fully booked. */
export const slotsUnavailableReasonSchema = z.enum(['calendar_unavailable'])

/**
 * Slots grouped by date in `timezone` (the `tz` asked for). Only dates with
 * at least one slot appear. `reason` is set when slots are withheld, for
 * example while a blocking calendar needs reconnecting (S6-3).
 */
export const slotsResponseSchema = z.object({
  timezone: timeZoneSchema,
  days: z.record(localDateSchema, z.array(instantSchema)),
  reason: slotsUnavailableReasonSchema.optional(),
})
export type SlotsResponse = z.infer<typeof slotsResponseSchema>

// ------------------------------------------------------------ POST /bookings

/**
 * `POST /bookings`. `timezone` is the customer's. `website` is the hidden
 * honeypot: real forms send it empty or not at all, and the server treats a
 * filled one as spam.
 */
export const createBookingBodySchema = z.object({
  serviceId: objectIdSchema,
  start: instantInputSchema,
  timezone: timeZoneSchema,
  customer: customerFieldsSchema,
  website: z.string().max(200).optional(),
})
export type CreateBookingBody = z.infer<typeof createBookingBodySchema>

/** `201` from `POST /bookings`. */
export const createBookingResponseSchema = z.object({
  id: objectIdSchema,
  start: instantSchema,
  end: instantSchema,
  manageUrl: z.url(),
})
export type CreateBookingResponse = z.infer<typeof createBookingResponseSchema>

// -------------------------------------------------------------- /manage/...

/**
 * `GET /manage/:token`, and the response to cancel and reschedule. `timezone`
 * is the customer's; the business timezone is beside it (S8-3, S10).
 */
export const manageSummarySchema = z.object({
  id: objectIdSchema,
  status: bookingStatusSchema,
  start: instantSchema,
  end: instantSchema,
  timezone: timeZoneSchema,
  service: z.object({
    id: objectIdSchema,
    name: z.string(),
    color: serviceColorSchema,
    durationMin: z.number().int().positive(),
  }),
  business: z.object({
    name: z.string(),
    slug: slugSchema,
    timezone: timeZoneSchema,
  }),
  customer: z.object({ name: z.string(), email: z.string() }),
})
export type ManageSummary = z.infer<typeof manageSummarySchema>

/** `POST /manage/:token/reschedule`. */
export const rescheduleBodySchema = z.object({ start: instantInputSchema })
export type RescheduleBody = z.infer<typeof rescheduleBodySchema>
