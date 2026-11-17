import { ObjectId } from 'mongodb'
import {
  scheduleSchema,
  computeSlots,
  groupSlotsByDate,
  scheduleRangeFor,
  localDateOf,
  occupiedInterval,
  lockBlocks,
  type CreateBookingBody,
} from '@openslots/core'
import { getDb } from '../mongo-client'
import type { BusinessDoc } from '../businesses/repository'
import { getService } from '../services/repository'
import { getSchedule } from '../schedules/repository'
import {
  calendarAvailability,
  markNeedsReconnect,
} from '../calendar-links/repository'
import {
  calendarProvider,
  CalendarAuthError,
  eventIdForBooking,
} from '../calendar'
import {
  ApiFailure,
  generateManageToken,
  tokenHash,
} from '../public-api/security'
import { bookings, type BookingDoc } from './repository'

let lockGuard: Promise<void> | undefined
export async function guardLocks() {
  lockGuard ??= (async () => {
    try {
      const indexes = await (
        await getDb()
      )
        .collection('slot_locks')
        .listIndexes()
        .toArray()
      if (
        !indexes.some(
          (i) =>
            i.unique &&
            !i.partialFilterExpression &&
            !i.sparse &&
            JSON.stringify(i.key) ===
              JSON.stringify({ businessId: 1, block: 1 }),
        )
      )
        throw Error('missing index')
    } catch {
      console.error(
        'OpenSlots booking refused: unique slot_locks {businessId, block} index missing. Run create-indexes.',
      )
      throw new ApiFailure('internal_error')
    }
  })()
  await lockGuard
}
export async function sweepAbandoned() {
  const col = await bookings()
  const expired = await col
    .find({
      status: 'pending',
      createdAt: { $lt: new Date(Date.now() - 120000) },
    })
    .toArray()
  for (const b of expired) {
    // Delete atomically claims cleanup; another sweep cannot delete a new attempt.
    const deleted = await col.deleteOne({
      _id: b._id,
      status: 'pending',
      createdAt: b.createdAt,
    })
    if (deleted.deletedCount)
      await (
        await getDb()
      )
        .collection('slot_locks')
        .deleteMany({ bookingId: b._id })
  }
}
async function calendarCall<T>(
  business: BusinessDoc,
  accountId: string,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof CalendarAuthError)
      await markNeedsReconnect(business._id, accountId)
    throw new ApiFailure('calendar_unavailable')
  }
}
export async function availableSlots(
  business: BusinessDoc,
  serviceId: string,
  range: { from: string; to: string },
  timezone: string,
  exclude?: ObjectId,
  snapshot?: BookingDoc['service'],
) {
  const service = await getService(business._id, serviceId)
  if (!service?.active) throw new ApiFailure('not_found')
  const schedule = await getSchedule(business._id, String(service.scheduleId))
  if (!schedule) return { timezone, days: {} }
  const availability = await calendarAvailability(business)
  if (!availability.ok)
    return { timezone, days: {}, reason: 'calendar_unavailable' as const }
  const expanded = scheduleRangeFor(range)
  const from = new Date(expanded.from + 'T00:00:00Z')
  const to = new Date(Date.parse(expanded.to + 'T00:00:00Z') + 86400000)
  const busy: { start: Date; end: Date }[] = []
  try {
    for (const c of availability.calendars) {
      const result = await calendarCall(business, c.accountId, () =>
        calendarProvider({ id: c.accountId, userId: c.userId }).freeBusy(
          [c.calendarId],
          from.toISOString(),
          to.toISOString(),
        ),
      )
      // A reschedule excludes its own event via the provider's busy data only
      // when the event is not a blocking calendar; see decision in TRD.
      for (const interval of result[c.calendarId] ?? [])
        busy.push({
          start: new Date(interval.start),
          end: new Date(interval.end),
        })
    }
  } catch {
    return { timezone, days: {}, reason: 'calendar_unavailable' as const }
  }
  const existing = await (
    await bookings()
  )
    .find({
      businessId: business._id,
      status: { $in: ['pending', 'confirmed'] },
      ...(exclude ? { _id: { $ne: exclude } } : {}),
    })
    .toArray()
  const counts: Record<string, number> = {}
  for (const b of existing) {
    busy.push(occupiedInterval({ start: b.start, ...b.service }))
    const date = localDateOf(b.start, schedule.timezone)
    counts[date] = (counts[date] ?? 0) + 1
  }
  return {
    timezone,
    days: groupSlotsByDate(
      computeSlots({
        service: { ...service, ...snapshot },
        schedule: scheduleSchema.parse(schedule),
        busy,
        bookedCountByDate: counts,
        range: expanded,
        now: new Date(),
      }),
      timezone,
      range,
    ),
  }
}
async function checkStart(
  business: BusinessDoc,
  serviceId: string,
  start: Date,
  exclude?: ObjectId,
  snapshot?: BookingDoc['service'],
) {
  const date = localDateOf(start, business.timezone)
  const result = await availableSlots(
    business,
    serviceId,
    { from: date, to: date },
    business.timezone,
    exclude,
    snapshot,
  )
  if ('reason' in result) throw new ApiFailure('calendar_unavailable')
  if (!Object.values(result.days).flat().includes(start.toISOString()))
    throw new ApiFailure('slot_taken')
}
async function acquire(b: BookingDoc, blocks: number[]) {
  if (!blocks.length) return
  try {
    await (await getDb()).collection('slot_locks').insertMany(
      blocks.map((block) => ({
        businessId: b.businessId,
        bookingId: b._id,
        block,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      { ordered: false },
    )
  } catch (e) {
    await (
      await getDb()
    )
      .collection('slot_locks')
      .deleteMany({ bookingId: b._id, block: { $in: blocks } })
    if (typeof e === 'object' && e && 'code' in e && e.code === 11000)
      throw new ApiFailure('slot_taken')
    throw e
  }
}
function event(business: BusinessDoc, b: BookingDoc, manageUrl?: string) {
  return {
    id: eventIdForBooking(String(b._id)),
    summary: `${b.service.name} — ${business.name} — ${b.customer.name}`,
    description: [b.customer.phone, b.customer.notes, manageUrl]
      .filter(Boolean)
      .join('\n'),
    start: { dateTime: b.start.toISOString() },
    end: { dateTime: b.end.toISOString() },
    attendees: [{ email: b.customer.email, displayName: b.customer.name }],
  }
}
export async function createBooking(
  business: BusinessDoc,
  input: CreateBookingBody,
  host: string,
) {
  await guardLocks()
  await sweepAbandoned()
  const service = await getService(business._id, input.serviceId)
  if (!service?.active) throw new ApiFailure('not_found')
  const start = new Date(input.start)
  const end = new Date(+start + service.durationMin * 60000)
  const token = generateManageToken()
  const id = new ObjectId()
  const result = {
    id: String(id),
    start: start.toISOString(),
    end: end.toISOString(),
    manageUrl: `${host}/m/${token}`,
  }
  if (input.website) return result
  await checkStart(business, input.serviceId, start)
  const availability = await calendarAvailability(business)
  if (!availability.ok) throw new ApiFailure('calendar_unavailable')
  const b: BookingDoc = {
    _id: id,
    businessId: business._id,
    serviceId: service._id,
    service: {
      name: service.name,
      color: service.color,
      durationMin: service.durationMin,
      bufferBeforeMin: service.bufferBeforeMin,
      bufferAfterMin: service.bufferAfterMin,
    },
    start,
    end,
    status: 'pending',
    customer: { ...input.customer, timezone: input.timezone },
    manageTokenHash: tokenHash(token),
    calendar: availability.bookingCalendar,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const col = await bookings()
  await col.insertOne(b)
  try {
    await acquire(b, lockBlocks({ start, ...b.service }))
    const c = availability.bookingCalendar
    const created = await calendarCall(business, c.accountId, () =>
      calendarProvider({
        id: c.accountId,
        userId: business.ownerUserId,
      }).createEvent(c.calendarId, event(business, b, result.manageUrl)),
    )
    await col.updateOne(
      { _id: id, status: 'pending' },
      {
        $set: {
          status: 'confirmed',
          googleEventId: created.id,
          updatedAt: new Date(),
        },
      },
    )
    return result
  } catch (e) {
    await (await getDb()).collection('slot_locks').deleteMany({ bookingId: id })
    await col.deleteOne({ _id: id })
    throw e
  }
}
export async function manageBooking(businessId: ObjectId, token: string) {
  const b = await (
    await bookings()
  ).findOne({ businessId, manageTokenHash: tokenHash(token) })
  if (!b) throw new ApiFailure('not_found')
  return b
}
export function summary(business: BusinessDoc, b: BookingDoc) {
  return {
    id: String(b._id),
    status: b.status,
    start: b.start.toISOString(),
    end: b.end.toISOString(),
    timezone: b.customer.timezone,
    service: {
      id: String(b.serviceId),
      name: b.service.name,
      color: b.service.color,
      durationMin: b.service.durationMin,
    },
    business: {
      name: business.name,
      slug: business.slug,
      timezone: business.timezone,
    },
    customer: { name: b.customer.name, email: b.customer.email },
  }
}
async function change(
  business: BusinessDoc,
  id: ObjectId,
  start?: Date,
  manageUrl?: string,
) {
  await guardLocks()
  await sweepAbandoned()
  const col = await bookings()
  const b = await col.findOneAndUpdate(
    {
      _id: id,
      businessId: business._id,
      status: 'confirmed',
      start: { $gt: new Date() },
      changing: { $ne: true },
    },
    { $set: { changing: true } },
    { returnDocument: 'after' },
  )
  if (!b) throw new ApiFailure('booking_not_changeable')
  const oldBlocks = lockBlocks({ start: b.start, ...b.service })
  let added: number[] = []
  try {
    const c = b.calendar
    if (!c || !b.googleEventId) throw new ApiFailure('calendar_unavailable')
    const provider = calendarProvider({
      id: c.accountId,
      userId: business.ownerUserId,
    })
    if (!start) {
      await calendarCall(business, c.accountId, () =>
        provider.deleteEvent(c.calendarId, b.googleEventId!),
      )
      await (
        await getDb()
      )
        .collection('slot_locks')
        .deleteMany({ bookingId: id })
      b.status = 'cancelled'
    } else {
      const service = await getService(business._id, String(b.serviceId))
      if (!service?.active) throw new ApiFailure('booking_not_changeable')
      await checkStart(business, String(b.serviceId), start, id, b.service)
      const next = {
        ...b,
        start,
        end: new Date(+start + b.service.durationMin * 60000),
      }
      const blocks = lockBlocks({ start, ...b.service })
      added = blocks.filter((block) => !oldBlocks.includes(block))
      await acquire(b, added)
      await calendarCall(business, c.accountId, () =>
        provider.updateEvent(
          c.calendarId,
          b.googleEventId!,
          event(business, next, manageUrl),
        ),
      )
      await (await getDb()).collection('slot_locks').deleteMany({
        bookingId: id,
        block: { $in: oldBlocks.filter((block) => !blocks.includes(block)) },
      })
      b.rescheduledFrom = b.start
      b.start = next.start
      b.end = next.end
    }
    await col.updateOne(
      { _id: id, businessId: business._id },
      {
        $set: {
          status: b.status,
          start: b.start,
          end: b.end,
          ...(b.rescheduledFrom ? { rescheduledFrom: b.rescheduledFrom } : {}),
          updatedAt: new Date(),
        },
      },
    )
    return b
  } catch (e) {
    if (added.length)
      await (
        await getDb()
      )
        .collection('slot_locks')
        .deleteMany({ bookingId: id, block: { $in: added } })
    throw e
  } finally {
    await col.updateOne({ _id: id }, { $unset: { changing: '' } })
  }
}
export const cancelBooking = (business: BusinessDoc, id: ObjectId) =>
  change(business, id)
export const rescheduleBooking = (
  business: BusinessDoc,
  id: ObjectId,
  start: Date,
  manageUrl?: string,
) => change(business, id, start, manageUrl)
