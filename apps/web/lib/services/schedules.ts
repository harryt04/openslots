import type { ObjectId } from 'mongodb'

import {
  getSchedule,
  listSchedules,
  type ScheduleDoc,
} from '../schedules/repository'

/**
 * The schedules the service editor needs: the "Uses schedule" choice and the
 * live preview. Both go through the schedules repository, so they are scoped
 * to the business like every other schedule read.
 */

export const listSchedulesForServices: (
  businessId: ObjectId,
) => Promise<ScheduleDoc[]> = listSchedules

/** The schedule if it belongs to the business, else null. */
export function getScheduleForServices(
  businessId: ObjectId,
  scheduleId: ObjectId,
): Promise<ScheduleDoc | null> {
  return getSchedule(businessId, scheduleId.toHexString())
}
