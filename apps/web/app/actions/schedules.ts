'use server'

import { revalidatePath } from 'next/cache'

import { requireBusiness } from '@/lib/businesses/current'
import {
  createSchedule,
  defaultWeekly,
  deleteSchedule,
  updateSchedule,
} from '@/lib/schedules/repository'
import type { FieldErrors } from '@/lib/schedules/validate'

export type ScheduleActionResult =
  | { ok: true; id?: string }
  | { ok: false; errors?: FieldErrors; message?: string }

/** Save one schedule's name, timezone, weekly hours and overrides. */
export async function saveScheduleAction(
  scheduleId: string,
  raw: unknown,
): Promise<ScheduleActionResult> {
  const { business } = await requireBusiness()
  const result = await updateSchedule(business._id, String(scheduleId), raw)
  if (result.ok) {
    revalidatePath('/availability')
    return { ok: true }
  }
  if (result.error === 'invalid') return { ok: false, errors: result.errors }
  return { ok: false, message: 'That schedule no longer exists.' }
}

/** A new schedule with the default hours, in the business timezone. */
export async function createScheduleAction(): Promise<ScheduleActionResult> {
  const { business } = await requireBusiness()
  const result = await createSchedule(business._id, {
    name: 'New schedule',
    timezone: business.timezone,
    weekly: defaultWeekly(),
    overrides: [],
  })
  if (!result.ok) return { ok: false, message: 'Could not create a schedule.' }
  revalidatePath('/availability')
  return { ok: true, id: result.schedule._id.toHexString() }
}

export async function deleteScheduleAction(
  scheduleId: string,
): Promise<ScheduleActionResult> {
  const { business } = await requireBusiness()
  const result = await deleteSchedule(business._id, String(scheduleId))
  if (result.ok) {
    revalidatePath('/availability')
    return { ok: true }
  }
  switch (result.error) {
    case 'last_schedule':
      return {
        ok: false,
        message:
          'A business needs at least one schedule, so the last one cannot be deleted.',
      }
    case 'in_use':
      return {
        ok: false,
        message: `This schedule is used by ${result.serviceNames.join(', ')}. Choose another schedule for ${result.serviceNames.length === 1 ? 'that service' : 'those services'} first.`,
      }
    default:
      return { ok: false, message: 'That schedule no longer exists.' }
  }
}
