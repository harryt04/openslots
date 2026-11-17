import { ObjectId, type Filter } from 'mongodb'
import type { ServiceDoc } from '../services/repository'
import { getDb } from '../mongo-client'

export type BookingDoc = {
  _id: ObjectId
  businessId: ObjectId
  serviceId: ObjectId
  service: Pick<
    ServiceDoc,
    'name' | 'color' | 'durationMin' | 'bufferBeforeMin' | 'bufferAfterMin'
  >
  start: Date
  end: Date
  status: 'pending' | 'confirmed' | 'cancelled'
  customer: {
    name: string
    email: string
    phone?: string
    notes?: string
    timezone: string
  }
  manageTokenHash: string
  googleEventId?: string
  calendar?: { accountId: string; calendarId: string }
  rescheduledFrom?: Date
  changing?: boolean
  createdAt: Date
  updatedAt: Date
}
export const bookings = async () =>
  (await getDb()).collection<BookingDoc>('bookings')
export async function getBooking(businessId: ObjectId, id: ObjectId) {
  return (await bookings()).findOne({ businessId, _id: id })
}
export async function listBookings(
  businessId: ObjectId,
  options: {
    status?: BookingDoc['status']
    from?: Date
    to?: Date
    search?: string
  } = {},
) {
  const filter: Filter<BookingDoc> = { businessId }
  if (options.status) filter.status = options.status
  if (options.from || options.to)
    filter.start = {
      ...(options.from ? { $gte: options.from } : {}),
      ...(options.to ? { $lt: options.to } : {}),
    }
  if (options.search) {
    const pattern = options.search
      .slice(0, 200)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.$or = [
      { 'customer.name': { $regex: pattern, $options: 'i' } },
      { 'customer.email': { $regex: pattern, $options: 'i' } },
    ]
  }
  return (await bookings()).find(filter).sort({ start: 1 }).limit(500).toArray()
}
