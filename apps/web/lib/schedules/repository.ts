import { ObjectId, type Collection } from 'mongodb'

import { getDb, mongoDBConfig } from '../mongo-client'
import { defaultWeekly } from './defaults'
import { validateSchedule, type FieldErrors } from './validate'

export { defaultWeekly }

/** `schedules` document (TRD section 3). `weekly[0]` is Sunday. */
export type ScheduleDoc = {
  _id: ObjectId
  businessId: ObjectId
  name: string
  timezone: string
  weekly: { startMin: number; endMin: number }[][]
  overrides: { date: string; ranges: { startMin: number; endMin: number }[] }[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Admin access to schedules. Every function takes the business id that came
 * from `requireBusiness()` and filters by it: there is no way to reach another
 * business's schedule, even with its id. Input is validated here with the
 * shared zod schema, whatever the caller already checked.
 */

async function schedules(): Promise<Collection<ScheduleDoc>> {
  return (await getDb()).collection<ScheduleDoc>(
    mongoDBConfig.collections.schedules,
  )
}

function toObjectId(id: string): ObjectId | null {
  return /^[0-9a-f]{24}$/.test(id) ? new ObjectId(id) : null
}

export type SaveResult =
  | { ok: true; schedule: ScheduleDoc }
  | { ok: false; error: 'invalid'; errors: FieldErrors }
  | { ok: false; error: 'not_found' }

export async function createSchedule(
  businessId: ObjectId,
  raw: unknown,
): Promise<SaveResult> {
  const checked = validateSchedule(raw)
  if (!checked.ok)
    return { ok: false, error: 'invalid', errors: checked.errors }
  const now = new Date()
  const schedule: ScheduleDoc = {
    _id: new ObjectId(),
    businessId,
    ...checked.data,
    createdAt: now,
    updatedAt: now,
  }
  await (await schedules()).insertOne(schedule)
  return { ok: true, schedule }
}

export async function listSchedules(
  businessId: ObjectId,
): Promise<ScheduleDoc[]> {
  return (await schedules())
    .find({ businessId })
    .sort({ createdAt: 1, _id: 1 })
    .toArray()
}

export async function getSchedule(
  businessId: ObjectId,
  scheduleId: string,
): Promise<ScheduleDoc | null> {
  const _id = toObjectId(scheduleId)
  if (!_id) return null
  return (await schedules()).findOne({ _id, businessId })
}

export async function updateSchedule(
  businessId: ObjectId,
  scheduleId: string,
  raw: unknown,
): Promise<SaveResult> {
  const _id = toObjectId(scheduleId)
  if (!_id) return { ok: false, error: 'not_found' }
  const checked = validateSchedule(raw)
  if (!checked.ok)
    return { ok: false, error: 'invalid', errors: checked.errors }
  const updated = await (
    await schedules()
  ).findOneAndUpdate(
    { _id, businessId },
    {
      $set: {
        name: checked.data.name,
        timezone: checked.data.timezone,
        weekly: checked.data.weekly,
        overrides: checked.data.overrides,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  )
  return updated
    ? { ok: true, schedule: updated }
    : { ok: false, error: 'not_found' }
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; error: 'not_found' | 'last_schedule' }
  | { ok: false; error: 'in_use'; serviceNames: string[] }

/**
 * Deletes a schedule unless it is the business's last one or a service uses
 * it. There are no transactions (TRD section 1), so the last-schedule rule is
 * enforced after the delete too: if two deletes race and leave none, the
 * schedule just removed is put back.
 */
export async function deleteSchedule(
  businessId: ObjectId,
  scheduleId: string,
): Promise<DeleteResult> {
  const _id = toObjectId(scheduleId)
  if (!_id) return { ok: false, error: 'not_found' }
  const col = await schedules()
  const existing = await col.findOne({ _id, businessId })
  if (!existing) return { ok: false, error: 'not_found' }

  if ((await col.countDocuments({ businessId })) <= 1) {
    return { ok: false, error: 'last_schedule' }
  }

  // Services may store the reference as an ObjectId or its hex string.
  const using = await (
    await getDb()
  )
    .collection<{ name?: string }>(mongoDBConfig.collections.services)
    .find({ businessId, scheduleId: { $in: [_id, _id.toHexString()] } })
    .project<{ name?: string }>({ name: 1 })
    .toArray()
  if (using.length > 0) {
    return {
      ok: false,
      error: 'in_use',
      serviceNames: using.map((s) => s.name ?? 'Untitled service'),
    }
  }

  const deleted = await col.deleteOne({ _id, businessId })
  if (deleted.deletedCount === 0) return { ok: false, error: 'not_found' }
  if ((await col.countDocuments({ businessId })) === 0) {
    await col.insertOne(existing)
    return { ok: false, error: 'last_schedule' }
  }
  return { ok: true }
}
