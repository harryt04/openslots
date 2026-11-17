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
import {
  reserveCapacity,
  releaseCapacity,
  capacityCount,
  sweepCapacity,
} from './capacity'
import { bookingCustomer } from './customer'
import { bookings, type BookingDoc } from './repository'

let lockGuard: Promise<void> | undefined
let lockGuardRetryAt = 0
export async function guardLocks() {
  if (!lockGuard && Date.now() < lockGuardRetryAt)
    throw new ApiFailure('internal_error')
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
  try {
    await lockGuard
  } catch (error) {
    lockGuard = undefined
    lockGuardRetryAt = Date.now() + 30_000
    throw error
  }
}
export const ATTEMPT_MS = 180_000
let nextSweepAt = 0
async function maybeSweep() {
  if (Date.now() < nextSweepAt) return
  nextSweepAt = Date.now() + 30_000
  try {
    await sweepAbandoned()
  } catch (error) {
    nextSweepAt = 0
    throw error
  }
}
export async function sweepAbandoned() {
  const col = await bookings()
  const db = await getDb()
  const now = new Date()
  const expired = await col
    .find({ status: { $in: ['pending', 'abandoned'] }, deadline: { $lt: now } })
    .toArray()
  for (const b of expired) {
    const claimed = await col.updateOne(
      {
        _id: b._id,
        status: { $in: ['pending', 'abandoned'] },
        deadline: { $lt: now },
      },
      { $set: { status: 'abandoned' } },
    )
    if (!claimed.matchedCount) continue
    // A process may have died after Google committed the create, before the
    // confirmation reached MongoDB. Reconcile that event before unlocking.
    if (b.calendar) {
      const business = await db
        .collection<BusinessDoc>('businesses')
        .findOne({ _id: b.businessId })
      try {
        if (!business) throw new ApiFailure('calendar_unavailable')
        const c = b.calendar
        await calendarCall(business, c.accountId, () =>
          calendarProvider({
            id: c.accountId,
            userId: business.ownerUserId,
          }).deleteEvent(c.calendarId, eventIdForBooking(String(b._id))),
        )
      } catch {
        await col.updateOne(
          { _id: b._id, status: 'abandoned' },
          { $set: { status: 'recovery_required' } },
        )
        console.error('OpenSlots booking recovery required', String(b._id))
        continue
      }
    }
    await db.collection('slot_locks').deleteMany({ bookingId: b._id })
    await releaseCapacity(b.capacityKey, b._id)
    await col.deleteOne({ _id: b._id, status: 'abandoned' })
  }
  const stale = await db
    .collection<{ bookingId: ObjectId; block: number; createdAt: Date }>(
      'slot_locks',
    )
    .find({ createdAt: { $lt: new Date(Date.now() - ATTEMPT_MS) } })
    .toArray()
  for (const lock of stale) {
    const b = await col.findOne({ _id: lock.bookingId })
    // Never collect ambiguous operations or a change still in flight.
    if (
      b &&
      (b.status === 'pending' ||
        b.status === 'recovery_required' ||
        (b.changing &&
          (!b.changingAt ||
            +b.changingAt + ATTEMPT_MS > Date.now() ||
            b.changingTarget)))
    )
      continue
    if (
      b?.status === 'confirmed' &&
      lockBlocks({ start: b.start, ...b.service }).includes(lock.block)
    )
      continue
    await db
      .collection('slot_locks')
      .deleteOne({ _id: lock._id, bookingId: lock.bookingId })
  }
  await sweepCapacity(ATTEMPT_MS)
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
      status: { $in: ['pending', 'confirmed', 'recovery_required'] },
      ...(exclude ? { _id: { $ne: exclude } } : {}),
    })
    .toArray()
  const counts: Record<string, number> = {}
  for (const b of existing) {
    busy.push(occupiedInterval({ start: b.start, ...b.service }))
    const date = localDateOf(b.start, schedule.timezone)
    if (String(b.serviceId) === serviceId)
      counts[date] = (counts[date] ?? 0) + 1
  }
  if (service.maxPerDay) {
    for (
      let day = Date.parse(expanded.from + 'T00:00:00Z');
      day <= Date.parse(expanded.to + 'T00:00:00Z');
      day += 86400000
    ) {
      const date = new Date(day).toISOString().slice(0, 10)
      counts[date] = Math.max(
        counts[date] ?? 0,
        await capacityCount(`${business._id}:${service._id}:${date}`, exclude),
      )
    }
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
  await maybeSweep()
  const service = await getService(business._id, input.serviceId)
  if (!service?.active) throw new ApiFailure('not_found')
  const customer = bookingCustomer(service, input.customer)
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
    deadline: new Date(Date.now() + ATTEMPT_MS),
    customer: { ...customer, timezone: input.timezone },
    manageTokenHash: tokenHash(token),
    calendar: availability.bookingCalendar,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const schedule = await getSchedule(business._id, String(service.scheduleId))
  if (service.maxPerDay && schedule)
    b.capacityKey = `${business._id}:${service._id}:${localDateOf(start, schedule.timezone)}`
  const col = await bookings()
  await col.insertOne(b)
  let eventAttempted = false
  try {
    await acquire(b, lockBlocks({ start, ...b.service }))
    if (b.capacityKey)
      await reserveCapacity(b.capacityKey, id, service.maxPerDay!)
    const c = availability.bookingCalendar
    // Leave the entire bounded token + Google budget before the sweep deadline.
    if (Date.now() + 60_000 >= +b.deadline!) throw new ApiFailure('slot_taken')
    eventAttempted = true
    const created = await calendarCall(business, c.accountId, () =>
      calendarProvider({
        id: c.accountId,
        userId: business.ownerUserId,
      }).createEvent(c.calendarId, event(business, b, result.manageUrl)),
    )
    const confirmed = await col.updateOne(
      { _id: id, status: 'pending', deadline: { $gt: new Date() } },
      {
        $set: {
          status: 'confirmed',
          googleEventId: created.id,
          updatedAt: new Date(),
        },
      },
    )
    if (confirmed.matchedCount !== 1 || Date.now() >= +b.deadline!)
      throw new ApiFailure('slot_taken')
    return result
  } catch (e) {
    if (eventAttempted) {
      const c = availability.bookingCalendar
      try {
        await calendarCall(business, c.accountId, () =>
          calendarProvider({
            id: c.accountId,
            userId: business.ownerUserId,
          }).deleteEvent(c.calendarId, eventIdForBooking(String(id))),
        )
      } catch {
        await col.updateOne(
          { _id: id },
          { $set: { status: 'recovery_required' } },
        )
        console.error('OpenSlots booking recovery required', String(id))
        throw e
      }
    }
    await (await getDb()).collection('slot_locks').deleteMany({ bookingId: id })
    await releaseCapacity(b.capacityKey, id)
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
  await maybeSweep()
  const col = await bookings()
  const b = await col.findOneAndUpdate(
    {
      _id: id,
      businessId: business._id,
      status: 'confirmed',
      start: { $gt: new Date() },
      $or: [
        { changing: { $ne: true } },
        { changingAt: { $lt: new Date(Date.now() - ATTEMPT_MS) } },
      ],
    },
    {
      $set: {
        changing: true,
        changingAt: new Date(),
        ...(start ? { changingTarget: start } : {}),
      },
    },
    { returnDocument: 'after' },
  )
  if (!b) throw new ApiFailure('booking_not_changeable')
  const oldBlocks = lockBlocks({ start: b.start, ...b.service })
  let added: number[] = []
  let obsolete: number[] = []
  let patchAttempted = false
  let retain = false
  let nextCapacityKey: string | undefined
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
      await releaseCapacity(b.capacityKey, id)
      b.status = 'cancelled'
    } else {
      const service = await getService(business._id, String(b.serviceId))
      if (!service?.active) throw new ApiFailure('booking_not_changeable')
      if (+start < +b.end && +start + b.service.durationMin * 60000 > +b.start)
        throw new ApiFailure(
          'booking_not_changeable',
          'Pick a time that does not overlap your current booking, or cancel and book again.',
        )
      await checkStart(business, String(b.serviceId), start, id, b.service)
      const next = {
        ...b,
        start,
        end: new Date(+start + b.service.durationMin * 60000),
      }
      const blocks = lockBlocks({ start, ...b.service })
      added = blocks.filter((block) => !oldBlocks.includes(block))
      await acquire(b, added)
      const schedule = await getSchedule(
        business._id,
        String(service.scheduleId),
      )
      if (service.maxPerDay && schedule) {
        const key = `${business._id}:${service._id}:${localDateOf(start, schedule.timezone)}`
        if (key !== b.capacityKey) {
          nextCapacityKey = key
          await reserveCapacity(key, id, service.maxPerDay)
        }
      }
      if (Date.now() + 60_000 >= +b.changingAt! + ATTEMPT_MS)
        throw new ApiFailure('booking_not_changeable')
      patchAttempted = true
      await calendarCall(business, c.accountId, () =>
        provider.updateEvent(c.calendarId, b.googleEventId!, {
          ...event(business, next, manageUrl),
          ...(!manageUrl ? { description: undefined } : {}),
        }),
      )
      obsolete = oldBlocks.filter((block) => !blocks.includes(block))
      b.rescheduledFrom = b.start
      b.start = next.start
      b.end = next.end
    }
    const moved = await col.updateOne(
      { _id: id, businessId: business._id, changingAt: b.changingAt },
      {
        $set: {
          ...(nextCapacityKey ? { capacityKey: nextCapacityKey } : {}),
          status: b.status,
          start: b.start,
          end: b.end,
          ...(b.rescheduledFrom ? { rescheduledFrom: b.rescheduledFrom } : {}),
          updatedAt: new Date(),
        },
        $unset: { changingTarget: '' },
      },
    )
    if (moved.matchedCount !== 1) throw new ApiFailure('booking_not_changeable')
    if (nextCapacityKey) await releaseCapacity(b.capacityKey, id)
    await (
      await getDb()
    )
      .collection('slot_locks')
      .deleteMany({ bookingId: id, block: { $in: obsolete } })
    return b
  } catch (e) {
    if (patchAttempted) {
      // A failed response may follow a successful patch. Keep both intervals
      // locked until an operator reconciles; never expose either time.
      retain = true
      await col.updateOne(
        { _id: id },
        { $set: { status: 'recovery_required' } },
      )
      console.error('OpenSlots booking recovery required', String(id))
    }
    if (!retain) await releaseCapacity(nextCapacityKey, id)
    if (added.length && !retain)
      await (
        await getDb()
      )
        .collection('slot_locks')
        .deleteMany({ bookingId: id, block: { $in: added } })
    throw e
  } finally {
    await col.updateOne(
      { _id: id, changingAt: b.changingAt },
      { $unset: { changing: '', changingAt: '', changingTarget: '' } },
    )
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
