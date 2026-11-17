import type { ObjectId } from 'mongodb'

import type { ScheduleDoc } from '../businesses/repository'
import { getDb, mongoDBConfig } from '../mongo-client'

/**
 * Read-only, business-scoped access to schedules for the service editor:
 * the "Uses schedule" choice and the live preview.
 *
 * Slice 2B owns schedules (`lib/schedules`). Fold these two queries into its
 * repository when the slices are integrated.
 */

export async function listSchedulesForServices(
  businessId: ObjectId,
): Promise<ScheduleDoc[]> {
  return (await getDb())
    .collection<ScheduleDoc>(mongoDBConfig.collections.schedules)
    .find({ businessId })
    .sort({ createdAt: 1, _id: 1 })
    .toArray()
}

/** The schedule if it belongs to the business, else null. */
export async function getScheduleForServices(
  businessId: ObjectId,
  scheduleId: ObjectId,
): Promise<ScheduleDoc | null> {
  return (await getDb())
    .collection<ScheduleDoc>(mongoDBConfig.collections.schedules)
    .findOne({ _id: scheduleId, businessId })
}
