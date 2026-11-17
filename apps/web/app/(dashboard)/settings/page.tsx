import type { Metadata } from 'next'

import { BusinessForm } from '@/components/custom/business-form'
import { PageHeader } from '@/components/custom/page-header'
import { updateBusinessAction } from '@/app/actions/business'
import { requireBusiness } from '@/lib/businesses/current'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const { business } = await requireBusiness()
  return (
    <>
      <PageHeader
        title="Settings"
        description={`Name, address and time zone for ${business.name}.`}
      />
      <div className="max-w-xl">
        {/* key: a different business remounts the form with its own values */}
        <BusinessForm
          key={business._id.toHexString()}
          defaults={{
            name: business.name,
            slug: business.slug,
            timezone: business.timezone,
          }}
          submitLabel="Save changes"
          action={updateBusinessAction}
        />
      </div>
    </>
  )
}
