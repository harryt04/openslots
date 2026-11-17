import { z } from 'zod'
import {
  publishableKeySchema,
  businessResponseSchema,
  slotsQuerySchema,
  slotsResponseSchema,
  createBookingBodySchema,
  createBookingResponseSchema,
  manageTokenSchema,
  manageSummarySchema,
  rescheduleBodySchema,
} from '@openslots/core'
import { getDb } from '../mongo-client'
import type { BusinessDoc } from '../businesses/repository'
import { listServices } from '../services/repository'
import {
  availableSlots,
  createBooking,
  manageBooking,
  summary,
  cancelBooking,
  rescheduleBooking,
} from '../bookings/service'
import { ApiFailure, errorResponse, tokenHash } from './security'

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiFailure('invalid_request')
  return result.data
}
export async function handle(
  request: Request,
  route: 'business' | 'slots' | 'bookings' | 'manage' | 'cancel' | 'reschedule',
  token?: string,
) {
  const headers = new Headers({ Vary: 'Origin', 'Cache-Control': 'no-store' })
  try {
    const db = await getDb()
    const origin = request.headers.get('origin')
    const host = new URL(process.env.BETTER_AUTH_URL!).origin
    // Preflight cannot carry the key: authorize only the instance origin or a
    // registered origin, then validate the key again on the actual request.
    if (request.method === 'OPTIONS') {
      const allowed =
        origin &&
        (origin === host ||
          (await db
            .collection<BusinessDoc>('businesses')
            .findOne({ allowedOrigins: origin })))
      if (!allowed) throw new ApiFailure('origin_not_allowed')
      headers.set('Access-Control-Allow-Origin', origin!)
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      headers.set(
        'Access-Control-Allow-Headers',
        'Content-Type, X-OpenSlots-Key',
      )
      return new Response(null, { status: 204, headers })
    }
    if (
      origin &&
      (origin === host ||
        (await db
          .collection<BusinessDoc>('businesses')
          .findOne({ allowedOrigins: origin })))
    )
      headers.set('Access-Control-Allow-Origin', origin)
    const key = request.headers.get('X-OpenSlots-Key')
    if (!publishableKeySchema.safeParse(key).success)
      throw new ApiFailure('invalid_key')
    const business = await db
      .collection<BusinessDoc>('businesses')
      .findOne({ publishableKey: key! })
    if (!business) throw new ApiFailure('invalid_key')
    if (
      origin &&
      origin !== host &&
      !business.allowedOrigins.includes(origin)
    ) {
      headers.delete('Access-Control-Allow-Origin')
      throw new ApiFailure('origin_not_allowed')
    }
    if (origin) headers.set('Access-Control-Allow-Origin', origin)
    if (route === 'slots' || request.method === 'POST') {
      // No proxy headers are trusted unless the operator explicitly enables it.
      const ip =
        process.env.TRUST_PROXY_IP === '1'
          ? (request.headers
              .get('x-forwarded-for')
              ?.split(',')[0]
              ?.trim()
              .slice(0, 100) ?? 'unknown')
          : 'unknown'
      const minute = Math.floor(Date.now() / 60000)
      const limit = request.method === 'POST' ? 30 : 60
      for (const scope of [`key:${business._id}`, `ip:${ip}`]) {
        const id = tokenHash(`${scope}:${request.method}:${minute}`)
        const counter = await db
          .collection<{ _id: string; count: number; expiresAt: Date }>(
            'api_rate_limits',
          )
          .findOneAndUpdate(
            { _id: id },
            {
              $inc: { count: 1 },
              $setOnInsert: { expiresAt: new Date((minute + 2) * 60000) },
            },
            { upsert: true, returnDocument: 'after' },
          )
        if (counter!.count > limit) {
          headers.set(
            'Retry-After',
            String(60 - (Math.floor(Date.now() / 1000) % 60)),
          )
          throw new ApiFailure('rate_limited')
        }
      }
    }
    let response: Response
    if (route === 'business') {
      const services = (await listServices(business._id))
        .filter((s) => s.active)
        .map((s) => ({ ...s, id: String(s._id) }))
      response = Response.json(
        parse(businessResponseSchema, {
          name: business.name,
          slug: business.slug,
          timezone: business.timezone,
          services,
        }),
      )
      headers.set('Cache-Control', 'private, max-age=60')
      headers.set('Vary', 'Origin, X-OpenSlots-Key')
    } else if (route === 'slots') {
      const query = parse(
        slotsQuerySchema,
        Object.fromEntries(new URL(request.url).searchParams),
      )
      response = Response.json(
        parse(
          slotsResponseSchema,
          await availableSlots(
            business,
            query.service,
            query,
            query.tz ?? business.timezone,
          ),
        ),
      )
    } else if (route === 'bookings') {
      const input = parse(
        createBookingBodySchema,
        await request.json().catch(() => null),
      )
      response = Response.json(
        parse(
          createBookingResponseSchema,
          await createBooking(business, input, host),
        ),
        { status: 201 },
      )
    } else {
      if (!manageTokenSchema.safeParse(token).success)
        throw new ApiFailure('not_found')
      let booking = await manageBooking(business._id, token!)
      if (route === 'cancel')
        booking = await cancelBooking(business, booking._id)
      if (route === 'reschedule') {
        const input = parse(
          rescheduleBodySchema,
          await request.json().catch(() => null),
        )
        booking = await rescheduleBooking(
          business,
          booking._id,
          new Date(input.start),
          `${host}/m/${token}`,
        )
      }
      response = Response.json(
        parse(manageSummarySchema, summary(business, booking)),
      )
    }
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (error) {
    const response = errorResponse(error)
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  }
}
