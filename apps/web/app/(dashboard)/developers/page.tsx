import type { Metadata } from 'next'

import { PageHeader } from '@/components/custom/page-header'
import { requireBusiness } from '@/lib/businesses/current'

export const metadata: Metadata = { title: 'Developers' }

// Placeholder: slice 3A replaces the content.
export default async function Page() {
  await requireBusiness()
  return (
    <PageHeader
      title="Developers"
      description="Embed booking on your own site."
    />
  )
}
