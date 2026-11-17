import type { Metadata } from 'next'

import { ScheduleEditor } from '@/components/custom/schedule-editor'
import { requireBusiness } from '@/lib/businesses/current'
import { listSchedules } from '@/lib/schedules/repository'

export const metadata: Metadata = { title: 'Availability' }

export default async function Page() {
  const { business } = await requireBusiness()
  const schedules = await listSchedules(business._id)
  return (
    <ScheduleEditor
      key={business._id.toHexString()}
      schedules={schedules.map((s) => ({
        id: s._id.toHexString(),
        name: s.name,
        timezone: s.timezone,
        weekly: s.weekly,
        overrides: s.overrides,
      }))}
    />
  )
}
