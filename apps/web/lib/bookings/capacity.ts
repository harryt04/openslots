import { ObjectId } from 'mongodb'
import { getDb } from '../mongo-client'
import { ApiFailure } from '../public-api/security'

type Counter = { _id: string; count: number; bookings: ObjectId[] }
const counters = async () =>
  (await getDb()).collection<Counter>('booking_day_counts')
export async function reserveCapacity(key: string, id: ObjectId, cap: number) {
  const col = await counters()
  // Separate initialization avoids a conditional upsert trying to replace a full
  // counter. The unique _id serializes concurrent initialization.
  try {
    await col.updateOne(
      { _id: key },
      { $setOnInsert: { count: 0, bookings: [] } },
      { upsert: true },
    )
  } catch (e) {
    if (!(e && typeof e === 'object' && 'code' in e && e.code === 11000))
      throw e
  }
  const result = await col.updateOne(
    { _id: key, count: { $lt: cap }, bookings: { $ne: id } },
    { $inc: { count: 1 }, $push: { bookings: id } },
  )
  if (!result.matchedCount) throw new ApiFailure('slot_taken')
}
export async function releaseCapacity(key: string | undefined, id: ObjectId) {
  if (key)
    await (
      await counters()
    ).updateOne(
      { _id: key, bookings: id },
      { $inc: { count: -1 }, $pull: { bookings: id } },
    )
}
export async function capacityCount(key: string, exclude?: ObjectId) {
  const counter = await (await counters()).findOne({ _id: key })
  return counter
    ? counter.count -
        (exclude && counter.bookings.some((id) => id.equals(exclude)) ? 1 : 0)
    : 0
}

export async function sweepCapacity(bound: number) {
  const db = await getDb()
  for (const counter of await (
    await counters()
  )
    .find({ count: { $gt: 0 } })
    .toArray()) {
    for (const id of counter.bookings) {
      const b = await db.collection('bookings').findOne({ _id: id })
      if (
        b &&
        (b.status === 'pending' ||
          b.status === 'recovery_required' ||
          (b.changing &&
            (b.changingTarget ||
              !b.changingAt ||
              +b.changingAt + bound > Date.now())))
      )
        continue
      if (b?.status === 'confirmed' && b.capacityKey === counter._id) continue
      await releaseCapacity(counter._id, id)
    }
  }
}
