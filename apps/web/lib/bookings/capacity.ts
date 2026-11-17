import { localDateOf, wallTimeToUtc, addDays } from '@openslots/core'
import { getDb } from '../mongo-client'
import { ApiFailure } from '../public-api/security'
import { bookings, type BookingDoc } from './repository'

export async function reserveCapacity(
  b: BookingDoc,
  opId: string,
  start: Date,
  timezone: string,
  cap: number,
) {
  const date = localDateOf(start, timezone)
  const legacy = await (
    await bookings()
  )
    .find({
      businessId: b.businessId,
      serviceId: b.serviceId,
      _id: { $ne: b._id },
      status: { $in: ['pending', 'confirmed'] },
      capManaged: { $ne: true },
      start: {
        $gte: wallTimeToUtc(date, 0, timezone, 'later')!,
        $lt: wallTimeToUtc(addDays(date, 1), 0, timezone, 'later')!,
      },
    })
    .toArray()
  const u = legacy.filter(
    (other) => localDateOf(other.start, timezone) === date,
  ).length
  for (let i = 0; i < cap - u; i++) {
    try {
      await (await getDb()).collection('cap_locks').insertOne({
        businessId: b.businessId,
        bookingId: b._id,
        opId,
        capKey: `${b.serviceId}|${date}|${i}`,
        createdAt: new Date(),
      })
      const locks = (await getDb()).collection('cap_locks')
      const prefix = `${b.serviceId}|${date}|`
      const count = await locks.countDocuments({
        businessId: b.businessId,
        capKey: { $gte: prefix, $lt: prefix + '\uffff' },
      })
      if (count + u > cap) {
        await locks.deleteMany({ opId })
        throw new ApiFailure('slot_taken')
      }
      return
    } catch (e) {
      if (!(e && typeof e === 'object' && 'code' in e && e.code === 11000))
        throw e
    }
  }
  throw new ApiFailure('slot_taken')
}
