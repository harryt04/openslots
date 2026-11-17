import type { Metadata } from 'next'

import { PageHeader } from '@/components/custom/page-header'
import { requireBusiness } from '@/lib/businesses/current'

export const metadata: Metadata = { title: 'Calendars' }

// Placeholder: slice 2C replaces the content.
export default async function Page() {
  await requireBusiness()
  return (
    <PageHeader
      title="Calendars"
      description="Google calendars that block your slots, and the one that receives bookings."
    />
  )
}
