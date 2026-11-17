import { after } from 'next/server'
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
  maybeSweep,
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
  after(() =>
    maybeSweep().catch(() => {
      console.error('OpenSlots sweep failed')
    }),
  )
  const headers = new Headers({ Vary: 'Origin', 'Cache-Control': 'no-store' })
  try {
    const db = await getDb()
    const origin = request.headers.get('origin')
    const host = new URL(process.env.BETTER_AUTH_URL!).origin
    // Preflights are uniform and reveal no business origin registrations.
    // The actual request is checked against the key's own business below.
    if (request.method === 'OPTIONS') {
      if (origin) headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      headers.set(
        'Access-Control-Allow-Headers',
        'Content-Type, X-OpenSlots-Key',
      )
      headers.set('Access-Control-Max-Age', '600')
      return new Response(null, { status: 204, headers })
    }
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
    headers.set('Access-Control-Expose-Headers', 'Retry-After')
    if (route === 'slots' || request.method === 'POST') {
      const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0)
      const forwarded =
        request.headers
          .get('x-forwarded-for')
          ?.split(',')
          .map((s) => s.trim()) ?? []
      const ip =
        Number.isInteger(hops) && hops > 0 ? forwarded.at(-hops) : undefined
      const minute = Math.floor(Date.now() / 60000)
      const write = request.method === 'POST'
      const configuredLimit = (name: string, fallback: number) => {
        const n = Number(process.env[name])
        return Number.isInteger(n) && n > 0 ? n : fallback
      }
      const scopes: [string, number][] = [
        [
          `key:${business._id}`,
          configuredLimit(
            write ? 'API_WRITE_KEY_LIMIT' : 'API_SLOTS_KEY_LIMIT',
            write ? 100 : 600,
          ),
        ],
      ]
      if (ip)
        scopes.unshift([
          `ip:${ip.slice(0, 100)}`,
          configuredLimit(
            write ? 'API_WRITE_IP_LIMIT' : 'API_SLOTS_IP_LIMIT',
            write ? 10 : 60,
          ),
        ])
      for (const [scope, limit] of scopes) {
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
    const expectedMethod = ['business', 'slots', 'manage'].includes(route)
      ? 'GET'
      : 'POST'
    if (request.method !== expectedMethod) {
      headers.set('Allow', expectedMethod + ', OPTIONS')
      return Response.json(
        { error: { code: 'invalid_request', message: 'Method not allowed' } },
        { status: 405, headers },
      )
    }
    // Bound the stream itself, including unknown JSON fields and cancel bodies.
    // Content-Length alone is supplied by the caller and cannot enforce a cap.
    let body: unknown = null
    if (request.method === 'POST') {
      const reader = request.body?.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > 16384) {
              await reader.cancel()
              throw new ApiFailure('invalid_request')
            }
            chunks.push(value)
          }
        } finally {
          reader.releaseLock()
        }
      }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        /* Schema reports invalid JSON where a body is required. */
      }
    }
    const outgoing = <T>(schema: z.ZodType<T>, value: unknown): T => {
      const result = schema.safeParse(value)
      if (!result.success) {
        console.error(
          'OpenSlots response validation failed',
          route,
          result.error.issues.map((i) => i.path.join('.')),
        )
        throw new ApiFailure('internal_error')
      }
      return result.data
    }
    let response: Response
    if (route === 'business') {
      const services = (await listServices(business._id))
        .filter((s) => s.active)
        .map((s) => ({ ...s, id: String(s._id) }))
      response = Response.json(
        outgoing(businessResponseSchema, {
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
        outgoing(
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
      const input = parse(createBookingBodySchema, body)
      response = Response.json(
        outgoing(
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
        const input = parse(rescheduleBodySchema, body)
        booking = await rescheduleBooking(
          business,
          booking._id,
          new Date(input.start),
          `${host}/m/${token}`,
        )
      }
      response = Response.json(
        outgoing(manageSummarySchema, summary(business, booking)),
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
