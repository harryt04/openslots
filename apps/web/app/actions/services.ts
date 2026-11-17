'use server'

import type { ObjectId } from 'mongodb'
import { revalidatePath } from 'next/cache'

import { requireBusiness } from '@/lib/businesses/current'
import {
  createService,
  deleteService,
  setServiceActive,
  toObjectId,
  updateService,
} from '@/lib/services/repository'
import { getScheduleForServices } from '@/lib/services/schedules'
import {
  parseServiceForm,
  type ServiceActionResult,
  type ServiceFormValues,
} from '@/lib/services/schema'

/**
 * Service mutations (S3, S4). Each action gets the current business from
 * `requireBusiness()` and passes its id to the repository, which filters by
 * it; every argument from the client is untrusted and validated here.
 */

type Parsed =
  | { ok: true; data: ServiceFormValues; scheduleId: ObjectId }
  | Extract<ServiceActionResult, { ok: false }>

async function parseForBusiness(
  businessId: ObjectId,
  raw: unknown,
): Promise<Parsed> {
  const parsed = parseServiceForm(raw)
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors }
  const scheduleId = toObjectId(parsed.data.scheduleId)
  // The schedule must be one of this business's own.
  const schedule = scheduleId
    ? await getScheduleForServices(businessId, scheduleId)
    : null
  if (!scheduleId || !schedule) {
    return { ok: false, fieldErrors: { scheduleId: 'Choose a schedule.' } }
  }
  return { ok: true, data: parsed.data, scheduleId }
}

function refresh() {
  // The layout too: the sidebar shows the number of services.
  revalidatePath('/services', 'layout')
}

export async function createServiceAction(
  raw: unknown,
): Promise<ServiceActionResult> {
  const { business } = await requireBusiness()
  const parsed = await parseForBusiness(business._id, raw)
  if (!parsed.ok) return parsed
  await createService(business._id, parsed.data, parsed.scheduleId)
  refresh()
  return { ok: true, redirectTo: '/services' }
}

export async function updateServiceAction(
  serviceId: unknown,
  raw: unknown,
): Promise<ServiceActionResult> {
  const { business } = await requireBusiness()
  const parsed = await parseForBusiness(business._id, raw)
  if (!parsed.ok) return parsed
  const updated = await updateService(
    business._id,
    serviceId,
    parsed.data,
    parsed.scheduleId,
  )
  if (!updated) return { ok: false, message: 'Service not found.' }
  refresh()
  return { ok: true, redirectTo: '/services' }
}

export async function setServiceActiveAction(
  serviceId: unknown,
  active: unknown,
): Promise<ServiceActionResult> {
  const { business } = await requireBusiness()
  if (typeof active !== 'boolean') {
    return { ok: false, message: 'Invalid request.' }
  }
  const updated = await setServiceActive(business._id, serviceId, active)
  if (!updated) return { ok: false, message: 'Service not found.' }
  refresh()
  return { ok: true }
}

export async function deleteServiceAction(
  serviceId: unknown,
): Promise<ServiceActionResult> {
  const { business } = await requireBusiness()
  const deleted = await deleteService(business._id, serviceId)
  if (!deleted) return { ok: false, message: 'Service not found.' }
  refresh()
  return { ok: true, redirectTo: '/services' }
}
