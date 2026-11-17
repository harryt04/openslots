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
  CalendarError,
  eventIdForBooking,
} from '../calendar'
import {
  ApiFailure,
  generateManageToken,
  tokenHash,
} from '../public-api/security'
import { reserveCapacity } from './capacity'
import { bookingCustomer } from './customer'
import { bookings, type BookingDoc } from './repository'

let lockGuard: Promise<void> | undefined
let lockGuardRetryAt = 0
export async function guardLocks() {
  if (!lockGuard && Date.now() < lockGuardRetryAt)
    throw new ApiFailure('internal_error')
  lockGuard ??= (async () => {
    try {
      for (const [collection, key] of [
        ['slot_locks', { businessId: 1, block: 1 }],
        ['cap_locks', { businessId: 1, capKey: 1 }],
      ] as const) {
        const indexes = await (
          await getDb()
        )
          .collection(collection)
          .listIndexes()
          .toArray()
        if (
          !indexes.some(
            (i) =>
              i.unique &&
              !i.partialFilterExpression &&
              !i.sparse &&
              JSON.stringify(i.key) === JSON.stringify(key),
          )
        )
          throw Error('missing index')
      }
    } catch {
      console.error(
        'OpenSlots booking refused: unique slot_locks or cap_locks index missing. Run create-indexes.',
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
const LEASE_MS = 180000
const MARGIN_MS = 30000
export const ATTEMPT_MS = 180_000
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
      ...(exclude ? { _id: { $ne: exclude } } : {}),
      $or: [
        {
          businessId: business._id,
          start: { $gte: new Date(+from - 86400000), $lt: to },
          end: { $gt: from },
        },
        {
          businessId: business._id,
          prevStart: { $gte: new Date(+from - 86400000), $lt: to },
          prevEnd: { $gt: from },
        },
      ],
    })
    .toArray()
  const counts: Record<string, number> = {}
  for (const b of existing) {
    if (!(
      b.status === 'confirmed' ||
      (b.status === 'pending' && b.expiresAt && +b.expiresAt > Date.now()) ||
      b.cleanup
    ))
      continue
    busy.push(occupiedInterval({ start: b.start, ...b.service }))
    if (b.prevOpId && b.prevStart)
      busy.push(occupiedInterval({ start: b.prevStart, ...b.service }))
    if (
      b.status === 'confirmed' ||
      (b.status === 'pending' && b.expiresAt && +b.expiresAt > Date.now())
    ) {
      const date = localDateOf(b.start, schedule.timezone)
      if (String(b.serviceId) === serviceId)
        counts[date] = (counts[date] ?? 0) + 1
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
async function release(opId: string) {
  const db = await getDb()
  await db.collection('slot_locks').deleteMany({ opId })
  await db.collection('cap_locks').deleteMany({ opId })
}
async function acquire(b: BookingDoc, opId: string, start: Date) {
  try {
    await (await getDb()).collection('slot_locks').insertMany(
      lockBlocks({ start, ...b.service }).map((block) => ({
        businessId: b.businessId,
        bookingId: b._id,
        opId,
        block,
        createdAt: new Date(),
      })),
      { ordered: false },
    )
  } catch (e) {
    await release(opId)
    if (e && typeof e === 'object' && 'code' in e && e.code === 11000)
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
    rev: 0,
    opId: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + ATTEMPT_MS),
    ...(service.maxPerDay ? { capManaged: true as const } : {}),
    customer: { ...customer, timezone: input.timezone },
    manageTokenHash: tokenHash(token),
    calendar: availability.bookingCalendar,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const schedule = await getSchedule(business._id, String(service.scheduleId))
  if (!schedule) throw new ApiFailure('slot_taken')
  const col = await bookings()
  await col.insertOne(b)
  try {
    await acquire(b, b.opId, start)
    if (service.maxPerDay)
      await reserveCapacity(
        b,
        b.opId,
        start,
        schedule.timezone,
        service.maxPerDay,
      )
  } catch (error) {
    await release(b.opId)
    await col.deleteOne({ _id: id, rev: 0, status: 'pending' })
    throw error
  }
  try {
    if (Date.now() + 60_000 >= +b.expiresAt!)
      throw new ApiFailure('calendar_unavailable')
    const c = availability.bookingCalendar
    const created = await calendarCall(business, c.accountId, () =>
      calendarProvider({
        id: c.accountId,
        userId: business.ownerUserId,
      }).createEvent(
        c.calendarId,
        event(business, b, result.manageUrl),
        +b.expiresAt! - 60000,
      ),
    )
    const confirmed = await cas(
      b,
      {
        status: 'confirmed',
        googleEventId: created.id,
        ...(service.maxPerDay ? { capOpId: b.opId } : {}),
      },
      {},
      { status: 'pending', expiresAt: { $gt: new Date() } },
    )
    if (!confirmed) throw new ApiFailure('slot_taken')
    return result
  } catch (error) {
    // Only this request's confirm can ever make this booking `confirmed`, so
    // a stored `confirmed` means the confirm was applied even though its
    // reply was lost. That stays true after the customer has moved the
    // booking (its `opId` is then another operation's): never compare
    // `opId` here, or a booking that is live would have its cap lock and
    // its calendar event deleted below.
    const current = await col.findOne({ _id: id })
    if (current && wasConfirmed(current)) return result
    if (
      await cas(b, {
        status: 'cancelled',
        abandoned: true,
        cleanup: true,
        purgeAfter: new Date(Date.now() + 3600000),
      })
    )
      await reconcile(id)
    // A lost confirmation may have landed in Google after another owner cleaned
    // the tombstone. Delete again without touching another operation's locks.
    else {
      const settled = await col.findOne({ _id: id })
      if (settled && wasConfirmed(settled)) return result
      // Release only when the attempt is certainly dead: its document is
      // gone or is an abandoned tombstone. Anything else is left to the
      // sweep, which errs on the side of keeping the time held.
      if (!settled || settled.abandoned) {
        await release(b.opId)
        await deleteEvent(b, business).catch(() => {})
      }
    }
    throw error
  }
}
/**
 * True when a booking's create was confirmed at some point: it is confirmed
 * now, or it was confirmed and the customer or owner has since cancelled it.
 * An attempt that never confirmed ends as an `abandoned` tombstone instead.
 */
function wasConfirmed(b: BookingDoc): boolean {
  return b.status === 'confirmed' || (b.status === 'cancelled' && !b.abandoned)
}
export async function manageBooking(businessId: ObjectId, token: string) {
  const b = await (
    await bookings()
  ).findOne({
    businessId,
    manageTokenHash: tokenHash(token),
    abandoned: { $ne: true },
  })
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

async function cas(
  b: BookingDoc,
  set: Record<string, unknown>,
  unset: Record<string, ''> = {},
  extra = {},
) {
  const writeId = crypto.randomUUID()
  try {
    const result = await (
      await bookings()
    ).updateOne(
      { _id: b._id, rev: b.rev, ...extra },
      {
        $set: { ...set, lastWriteId: writeId, updatedAt: new Date() },
        $inc: { rev: 1 },
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
    )
    return result.matchedCount === 1
  } catch (error) {
    const current = await (await bookings()).findOne({ _id: b._id })
    if (current?.lastWriteId === writeId) return true
    throw error
  }
}
async function deleteEvent(
  b: BookingDoc,
  business: BusinessDoc,
  notAfter?: number,
) {
  if (!b.calendar) throw new ApiFailure('calendar_unavailable')
  const c = b.calendar
  try {
    await calendarProvider({
      id: c.accountId,
      userId: business.ownerUserId,
    }).deleteEvent(
      c.calendarId,
      b.googleEventId ?? eventIdForBooking(String(b._id)),
      notAfter,
    )
  } catch (e) {
    if (e instanceof CalendarError && [404, 410].includes(e.status)) return
    throw e
  }
}
/** The provider deadline fences sends before lease expiry. Revision ownership
 * still fences lock release and clearing sync intent after an in-flight call. */
export async function reconcile(id: ObjectId) {
  const col = await bookings()
  let b = await col.findOne({ _id: id })
  if (!b || (!b.cleanup && !b.eventSync)) return
  if (b.syncAt && +b.syncAt > Date.now() - LEASE_MS) return
  if (b.retryAt && +b.retryAt > Date.now()) return
  const leaseStart = Date.now()
  const notAfter = leaseStart + LEASE_MS - MARGIN_MS
  if (!(await cas(b, { syncAt: new Date(leaseStart) }))) return
  b = (await col.findOne({ _id: id, rev: b.rev + 1 }))!
  if (!b) return
  const db = await getDb()
  const business = await db
    .collection<BusinessDoc>('businesses')
    .findOne({ _id: b.businessId })
  try {
    if (!business) throw new CalendarError(503)
    if (b.status === 'cancelled' && b.cleanup) {
      await deleteEvent(b, business, notAfter)
      await db.collection('slot_locks').deleteMany({ bookingId: id })
      await db.collection('cap_locks').deleteMany({ bookingId: id })
      await cas(
        b,
        {},
        {
          cleanup: '',
          syncAt: '',
          retryAt: '',
          retryCount: '',
          eventSync: '',
          prevOpId: '',
          prevStart: '',
          prevEnd: '',
          prevCapOpId: '',
        },
      )
    } else if (b.status === 'confirmed' && b.eventSync && b.calendar) {
      const c = b.calendar
      const provider = calendarProvider({
        id: c.accountId,
        userId: business.ownerUserId,
      })
      const { description: _description, ...payload } = event(business, b)
      void _description
      try {
        await provider.updateEvent(
          c.calendarId,
          b.googleEventId ?? payload.id,
          { ...payload, status: 'confirmed' },
          notAfter,
        )
      } catch (e) {
        if (!(e instanceof CalendarError && [404, 410].includes(e.status)))
          throw e
        if (!(await col.findOne({ _id: id, rev: b.rev, status: 'confirmed' })))
          return
        await provider.createEvent(c.calendarId, payload, notAfter)
        // A duplicate insert may refer to a cancelled Google tombstone.
        await provider.updateEvent(
          c.calendarId,
          b.googleEventId ?? payload.id!,
          { ...payload, status: 'confirmed' },
          notAfter,
        )
      }
      // Cancellation may have won while Google was in flight. Never unlock on
      // a stale snapshot; leave reconciliation intent for its new owner.
      if (!(await col.findOne({ _id: id, rev: b.rev, status: 'confirmed' })))
        return
      if (b.prevOpId)
        await db.collection('slot_locks').deleteMany({ opId: b.prevOpId })
      if (b.prevCapOpId)
        await db.collection('cap_locks').deleteMany({ opId: b.prevCapOpId })
      await cas(
        b,
        {},
        {
          eventSync: '',
          prevOpId: '',
          prevStart: '',
          prevEnd: '',
          prevCapOpId: '',
          syncAt: '',
          retryAt: '',
          retryCount: '',
        },
      )
    }
  } catch (e) {
    if (e instanceof CalendarAuthError)
      await markNeedsReconnect(b.businessId, b.calendar!.accountId)
    await cas(b, {
      retryCount: (b.retryCount ?? 0) + 1,
      retryAt: new Date(
        Date.now() +
          Math.min(3600000, 60000 * 2 ** Math.min(b.retryCount ?? 0, 6)),
      ),
    })
  }
}
export async function cancelBooking(business: BusinessDoc, id: ObjectId) {
  const col = await bookings()
  for (let attempt = 0; attempt < 5; attempt++) {
    const b = await col.findOne({
      _id: id,
      businessId: business._id,
      abandoned: { $ne: true },
    })
    if (!b) throw new ApiFailure('not_found')
    if (b.status === 'cancelled') return b
    if (b.status !== 'confirmed' || +b.start <= Date.now())
      throw new ApiFailure('booking_not_changeable')
    if (
      !(await cas(
        b,
        {
          status: 'cancelled',
          cleanup: true,
          purgeAfter: new Date(Date.now() + 3600000),
        },
        // A cancellation should not wait out a backoff left by an earlier
        // failed calendar update of this booking.
        { pendingOp: '', retryAt: '', retryCount: '' },
      ))
    )
      continue
    await reconcile(id)
    return (await col.findOne({ _id: id }))!
  }
  throw new ApiFailure('slot_taken')
}
export async function rescheduleBooking(
  business: BusinessDoc,
  id: ObjectId,
  start: Date,
  manageUrl?: string,
) {
  void manageUrl
  await guardLocks()
  const col = await bookings()
  const b = await col.findOne({
    _id: id,
    businessId: business._id,
    abandoned: { $ne: true },
  })
  if (!b || b.status !== 'confirmed' || +b.start <= Date.now())
    throw new ApiFailure('booking_not_changeable')
  if (
    b.eventSync ||
    b.prevOpId ||
    b.prevCapOpId ||
    (b.pendingOp && +b.pendingOp.startedAt > Date.now() - 120000)
  )
    throw new ApiFailure('slot_taken', 'Try again in a moment.')
  const old = occupiedInterval({ start: b.start, ...b.service })
  const next = occupiedInterval({ start, ...b.service })
  if (+next.start < +old.end && +next.end > +old.start)
    throw new ApiFailure(
      'booking_not_changeable',
      'Pick a time that does not overlap your current booking, or cancel and book again.',
    )
  const service = await getService(business._id, String(b.serviceId))
  if (!service?.active) throw new ApiFailure('booking_not_changeable')
  const schedule = await getSchedule(business._id, String(service.scheduleId))
  if (!schedule) throw new ApiFailure('slot_taken')
  if (
    b.capManaged &&
    !service.maxPerDay &&
    localDateOf(start, schedule.timezone) !==
      localDateOf(b.start, schedule.timezone)
  )
    throw new ApiFailure(
      'slot_taken',
      'This booking keeps a daily place. Cancel and book again to change dates.',
    )
  const opId = crypto.randomUUID()
  if (!(await cas(b, { pendingOp: { opId, startedAt: new Date() } })))
    throw new ApiFailure('slot_taken')
  const claimed = { ...b, rev: b.rev + 1 }
  const changesDate =
    localDateOf(start, schedule.timezone) !==
    localDateOf(b.start, schedule.timezone)
  const takeCap = changesDate && !!service.maxPerDay
  try {
    await checkStart(business, String(b.serviceId), start, id, b.service)
    await acquire(b, opId, start)
    if (takeCap)
      await reserveCapacity(
        b,
        opId,
        start,
        schedule.timezone,
        service.maxPerDay!,
      )
    if (
      !(await cas(
        claimed,
        {
          start,
          end: new Date(+start + b.service.durationMin * 60000),
          opId,
          prevOpId: b.opId,
          prevStart: b.start,
          prevEnd: b.end,
          rescheduledFrom: b.start,
          eventSync: true,
          ...(takeCap
            ? {
                capManaged: true,
                capOpId: opId,
                ...(b.capOpId ? { prevCapOpId: b.capOpId } : {}),
              }
            : {}),
        },
        { pendingOp: '' },
      ))
    )
      throw new ApiFailure('slot_taken')
  } catch (e) {
    let current = await col.findOne({ _id: id })
    if (!current) throw e
    if (current.opId !== opId) {
      await cas(claimed, {}, { pendingOp: '' })
      current = await col.findOne({ _id: id })
      if (!current) throw e
      if (current.opId !== opId) {
        await release(opId)
        throw e
      }
    }
    // Stored committed move is success even if its acknowledgement was lost.
  }
  await reconcile(id)
  const current = await col.findOne({ _id: id })
  if (current?.status !== 'confirmed' || current.opId !== opId)
    throw new ApiFailure('slot_taken')
  return current
}
const sweepOffsets: Record<string, number> = {}
let nextSweepAt = 0
export async function maybeSweep() {
  if (Date.now() < nextSweepAt) return
  nextSweepAt = Date.now() + 30000
  await sweepAbandoned()
}
export async function sweepAbandoned() {
  const col = await bookings(),
    db = await getDb(),
    now = new Date()
  const batch = 50
  for (const b of await col
    .find({ status: 'pending', expiresAt: { $lte: now } })
    .limit(batch)
    .toArray()) {
    if (
      await cas(b, {
        status: 'cancelled',
        abandoned: true,
        cleanup: true,
        purgeAfter: new Date(+now + 3600000),
      })
    )
      await reconcile(b._id)
  }
  for (const b of await col
    .find({
      $or: [{ cleanup: true }, { eventSync: true }],
      ...sweepEligible(now),
    })
    .sort({ syncAt: 1, _id: 1 })
    .limit(batch)
    .toArray())
    await reconcile(b._id)
  for (const b of await col
    .find({ 'pendingOp.startedAt': { $lt: new Date(+now - 300000) } })
    .limit(batch)
    .toArray())
    await cas(b, {}, { pendingOp: '' })
  for (const b of await col
    .find({
      purgeAfter: { $lte: now },
      ...sweepEligible(now),
      status: 'cancelled',
      cleanup: { $ne: true },
    })
    .sort({ syncAt: 1, _id: 1 })
    .limit(batch)
    .toArray()) {
    const business = await db
      .collection<BusinessDoc>('businesses')
      .findOne({ _id: b.businessId })
    if (!(await cas(b, { syncAt: now }))) continue
    const claimed = { ...b, rev: b.rev + 1 }
    try {
      if (!business) throw new CalendarError(503)
      await deleteEvent(b, business, +now + LEASE_MS - MARGIN_MS)
      if (b.abandoned) await col.deleteOne({ _id: b._id, rev: claimed.rev })
      else await cas(claimed, {}, { purgeAfter: '', syncAt: '' })
    } catch (e) {
      await cas(claimed, {
        retryCount: (b.retryCount ?? 0) + 1,
        retryAt: new Date(
          +now + Math.min(3600000, 60000 * 2 ** Math.min(b.retryCount ?? 0, 6)),
        ),
      })
      if (e instanceof CalendarAuthError)
        await markNeedsReconnect(b.businessId, b.calendar!.accountId)
    }
  }
  for (const name of ['slot_locks', 'cap_locks']) {
    const locks = await db
      .collection<{ bookingId: ObjectId; opId: string; createdAt: Date }>(name)
      .find({ createdAt: { $lt: new Date(+now - 600000) } })
      .skip(sweepOffsets[name] ?? 0)
      .limit(batch)
      .toArray()
    sweepOffsets[name] =
      locks.length === batch ? (sweepOffsets[name] ?? 0) + batch : 0
    for (const lock of locks) {
      const b = await col.findOne({ _id: lock.bookingId })
      if (
        !b ||
        (b.status === 'cancelled' && !b.cleanup) ||
        ((b.status === 'pending' || b.status === 'confirmed') &&
          ![
            b.opId,
            b.prevOpId,
            b.capOpId,
            b.prevCapOpId,
            b.pendingOp?.opId,
          ].includes(lock.opId))
      )
        await db.collection(name).deleteOne({ _id: lock._id, opId: lock.opId })
    }
    const ended = await col
      .find({
        status: 'confirmed',
        end: { $lt: new Date(+now - 86400000) },
        eventSync: { $ne: true },
        pendingOp: { $exists: false },
        locksReleased: { $ne: true },
      })
      .limit(batch)
      .toArray()
    for (const b of ended) {
      for (const collection of ['slot_locks', 'cap_locks'])
        await db.collection(collection).deleteMany({
          bookingId: b._id,
          opId: { $in: [b.opId, b.capOpId].filter(Boolean) },
        })
      await cas(b, { locksReleased: true })
    }
  }
}

function sweepEligible(now: Date) {
  return {
    $and: [
      {
        $or: [
          { syncAt: { $exists: false } },
          { syncAt: { $lte: new Date(+now - LEASE_MS) } },
        ],
      },
      { $or: [{ retryAt: { $exists: false } }, { retryAt: { $lte: now } }] },
    ],
  }
}
