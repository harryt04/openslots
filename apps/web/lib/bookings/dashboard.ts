import { ObjectId, type Filter } from 'mongodb'
import { localDateOf } from '@openslots/core'
import { bookings, type BookingDoc } from './repository'

export type BookingTab = 'upcoming' | 'past' | 'cancelled'
export function dayGroups<T extends { start: Date }>(
  rows: T[],
  timezone: string,
) {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const day = localDateOf(row.start, timezone)
    groups.set(day, [...(groups.get(day) ?? []), row])
  }
  return [...groups].map(([day, items]) => ({ day, items }))
}
export function weekRange(now: Date, timezone: string) {
  const today = localDateOf(now, timezone)
  const date = new Date(today + 'T12:00:00Z')
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  const from = date.toISOString().slice(0, 10)
  date.setUTCDate(date.getUTCDate() + 6)
  return { today, from, to: date.toISOString().slice(0, 10) }
}
export async function dashboardRows(
  businessId: ObjectId,
  tab: BookingTab,
  search = '',
  page = 0,
  now = new Date(),
) {
  const filter: Filter<BookingDoc> = {
    businessId,
    abandoned: { $ne: true },
    ...(tab === 'cancelled'
      ? { status: 'cancelled' as const }
      : {
          status: { $in: ['confirmed', 'pending'] },
          start: tab === 'past' ? { $lt: now } : { $gte: now },
        }),
  }
  const pattern = search.slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (pattern)
    filter.$or = [
      { 'customer.name': { $regex: pattern, $options: 'i' } },
      { 'customer.email': { $regex: pattern, $options: 'i' } },
    ]
  return (
    (await bookings())
      .find(filter)
      // Newest first for what has already happened or been cancelled.
      .sort({ start: tab === 'upcoming' ? 1 : -1 })
      .skip(Math.max(0, Math.floor(Math.min(page, 10000))) * 50)
      .limit(51)
      .toArray()
  )
}
export async function upcomingCount(businessId: ObjectId, now = new Date()) {
  return (await bookings()).countDocuments({
    businessId,
    abandoned: { $ne: true },
    status: 'confirmed',
    start: { $gte: now },
  })
}
export async function dashboardStats(
  businessId: ObjectId,
  timezone: string,
  now = new Date(),
) {
  const range = weekRange(now, timezone)
  // A coarse indexed UTC bound encloses every possible local date in the week.
  const rows = await (
    await bookings()
  )
    .find({
      businessId,
      abandoned: { $ne: true },
      status: 'confirmed',
      start: {
        $gte: new Date(Date.parse(range.from) - 86400000),
        $lt: new Date(Date.parse(range.to) + 172800000),
      },
    })
    .toArray()
  const week = rows.filter((b) => {
    const d = localDateOf(b.start, timezone)
    return d >= range.from && d <= range.to
  })
  const today = week.filter(
    (b) => localDateOf(b.start, timezone) === range.today,
  )
  return {
    today: today.length,
    week: week.length,
    hours: week.reduce((n, b) => n + b.service.durationMin / 60, 0),
    next: today
      .filter((b) => b.start >= now)
      .sort((a, b) => +a.start - +b.start)[0]?.start,
  }
}
