import type { Metadata } from 'next'

import { PageHeader } from '@/components/custom/page-header'
import { requireBusiness } from '@/lib/businesses/current'

export const metadata: Metadata = { title: 'Services' }

// Placeholder: slice 2A replaces the content.
export default async function Page() {
  await requireBusiness()
  return (
    <PageHeader
      title="Services"
      description="What customers can book, and how long each one takes."
    />
  )
}
