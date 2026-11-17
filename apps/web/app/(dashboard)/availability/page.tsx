import type { Metadata } from 'next'

import { PageHeader } from '@/components/custom/page-header'
import { requireBusiness } from '@/lib/businesses/current'

export const metadata: Metadata = { title: 'Availability' }

// Placeholder: slice 2B replaces the content.
export default async function Page() {
  await requireBusiness()
  return (
    <PageHeader
      title="Availability"
      description="The days and hours customers may book. Google events are subtracted on top of this."
    />
  )
}
