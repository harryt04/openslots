import type { Metadata } from 'next'

import { ServiceForm } from '@/components/custom/service-form'
import { createServiceAction } from '@/app/actions/services'
import { requireBusiness } from '@/lib/businesses/current'
import { editorSchedules, newServiceDefaults } from '@/lib/services/editor'

export const metadata: Metadata = { title: 'New service' }

export default async function NewServicePage() {
  const { business } = await requireBusiness()
  const schedules = await editorSchedules(business._id)
  return (
    <ServiceForm
      key={business._id.toHexString()}
      mode="create"
      defaults={newServiceDefaults(schedules[0]?.id ?? '')}
      schedules={schedules}
      now={new Date().toISOString()}
      action={createServiceAction}
    />
  )
}
