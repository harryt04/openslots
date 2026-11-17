import type { Metadata } from 'next'

import { PageHeader } from '@/components/custom/page-header'
import { requireBusiness } from '@/lib/businesses/current'

export const metadata: Metadata = { title: 'Developers' }

import { Settings } from './settings'
export default async function Page() {
  const { business } = await requireBusiness()
  return (
    <>
      <PageHeader
        title="Developers"
        description="Embed booking on your own site."
      />
      <Settings
        publishableKey={business.publishableKey}
        origins={business.allowedOrigins}
        host={new URL(process.env.BETTER_AUTH_URL!).origin}
      />
    </>
  )
}
