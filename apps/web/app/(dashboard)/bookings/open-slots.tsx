import { availableSlots } from '@/lib/bookings/service'
import { weekRange } from '@/lib/bookings/dashboard'
import type { BusinessDoc } from '@/lib/businesses/repository'
import type { ServiceDoc } from '@/lib/services/repository'
export async function OpenSlots({
  business,
  services,
}: {
  business: BusinessDoc
  services: ServiceDoc[]
}) {
  const { from, to } = weekRange(new Date(), business.timezone)
  let count: number | null = 0
  try {
    const results = await Promise.all(
      services
        .filter((s) => s.active)
        .map((s) =>
          availableSlots(
            business,
            String(s._id),
            { from, to },
            business.timezone,
          ),
        ),
    )
    if (results.some((r) => 'reason' in r)) count = null
    else
      count = results.reduce(
        (n, r) =>
          n +
          Object.values(r.days).reduce((sum, slots) => sum + slots.length, 0),
        0,
      )
  } catch {
    count = null
  }
  return (
    <>
      <p className="font-mono text-3xl font-semibold">
        {count ?? 'Unavailable'}
      </p>
      <p className="text-xs">
        across {services.filter((s) => s.active).length} services
      </p>
    </>
  )
}
