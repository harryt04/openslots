import type { BusinessDoc } from '../businesses/repository'
import type { ServiceDoc } from '../services/repository'
import { weekRange } from './dashboard'
import { availableSlots } from './service'

// Counting open slots reads Google free/busy for every blocking calendar,
// once per active service. The Bookings home re-renders on every tab, search
// and page change, so remember the answer for a minute per business rather
// than asking Google each time. It is a headline number, not a booking
// decision: the booking path never uses this cache.
const CACHE_MS = 60_000
const cache = new Map<string, { at: number; count: number | null }>()

/** Open slots this week across active services, or null when unavailable. */
export async function openSlotsThisWeek(
  business: BusinessDoc,
  services: ServiceDoc[],
  now = new Date(),
): Promise<number | null> {
  const active = services.filter((s) => s.active)
  const { from, to } = weekRange(now, business.timezone)
  const key = `${business._id}:${from}:${active
    .map((s) => `${s._id}:${+s.updatedAt}`)
    .join(',')}`
  const cached = cache.get(key)
  if (cached && now.getTime() - cached.at < CACHE_MS) return cached.count

  let count: number | null
  try {
    const results = await Promise.all(
      active.map((s) =>
        availableSlots(
          business,
          String(s._id),
          { from, to },
          business.timezone,
        ),
      ),
    )
    count = results.some((r) => 'reason' in r)
      ? null
      : results.reduce(
          (n, r) =>
            n +
            Object.values(r.days).reduce((sum, slots) => sum + slots.length, 0),
          0,
        )
  } catch {
    count = null
  }
  if (cache.size > 500) cache.clear()
  cache.set(key, { at: now.getTime(), count })
  return count
}
