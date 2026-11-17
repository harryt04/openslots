import type { ObjectId } from 'mongodb'

import type { EditorSchedule } from '@/components/custom/service-form'
import { openDaysSummary } from './format'
import type { ServiceDoc } from './repository'
import { listSchedulesForServices } from './schedules'
import type { ServiceFormValues } from './schema'

/** The business's schedules as plain data for the editor and its preview. */
export async function editorSchedules(
  businessId: ObjectId,
): Promise<EditorSchedule[]> {
  const docs = await listSchedulesForServices(businessId)
  return docs.map((s) => ({
    id: s._id.toHexString(),
    name: s.name,
    days: openDaysSummary(s.weekly),
    timezone: s.timezone,
    weekly: s.weekly as EditorSchedule['weekly'],
    overrides: s.overrides,
  }))
}

/** Values for a new service: the spec's Trim, on the first schedule. */
export function newServiceDefaults(scheduleId: string): ServiceFormValues {
  return {
    name: '',
    description: '',
    color: 'blue',
    durationMin: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    startIntervalMin: 30,
    minNoticeMin: 120,
    windowDays: 60,
    scheduleId,
    askPhone: false,
    askNotes: false,
  }
}

export function serviceToFormValues(s: ServiceDoc): ServiceFormValues {
  return {
    name: s.name,
    description: s.description,
    color: s.color,
    durationMin: s.durationMin,
    bufferBeforeMin: s.bufferBeforeMin,
    bufferAfterMin: s.bufferAfterMin,
    startIntervalMin: s.startIntervalMin,
    minNoticeMin: s.minNoticeMin,
    windowDays: s.windowDays,
    ...(s.maxPerDay !== undefined ? { maxPerDay: s.maxPerDay } : {}),
    scheduleId: s.scheduleId.toHexString(),
    askPhone: s.askPhone,
    askNotes: s.askNotes,
  }
}
