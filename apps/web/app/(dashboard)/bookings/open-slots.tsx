import { openSlotsThisWeek } from '@/lib/bookings/open-slots'
import type { BusinessDoc } from '@/lib/businesses/repository'
import type { ServiceDoc } from '@/lib/services/repository'

export async function OpenSlots({
  business,
  services,
}: {
  business: BusinessDoc
  services: ServiceDoc[]
}) {
  const count = await openSlotsThisWeek(business, services)
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
