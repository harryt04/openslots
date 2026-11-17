import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ServiceForm } from '@/components/custom/service-form'
import { updateServiceAction } from '@/app/actions/services'
import { requireBusiness } from '@/lib/businesses/current'
import { editorSchedules, serviceToFormValues } from '@/lib/services/editor'
import { getService } from '@/lib/services/repository'

export const metadata: Metadata = { title: 'Edit service' }

export default async function EditServicePage({
  params,
}: PageProps<'/services/[id]'>) {
  const { id } = await params
  const { business } = await requireBusiness()
  // Scoped to the current business: another business's id is a 404.
  const service = await getService(business._id, id)
  if (!service) notFound()
  const schedules = await editorSchedules(business._id)
  const serviceId = service._id.toHexString()
  return (
    <ServiceForm
      key={serviceId}
      mode="edit"
      serviceId={serviceId}
      defaults={serviceToFormValues(service)}
      schedules={schedules}
      now={new Date().toISOString()}
      action={updateServiceAction.bind(null, serviceId)}
    />
  )
}
