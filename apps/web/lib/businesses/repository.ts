import { ObjectId, type Collection } from 'mongodb'
import { z } from 'zod'

import { getDb, mongoDBConfig } from '../mongo-client'
import { generatePublishableKey } from './keys'
import { defaultWeekly, type ScheduleDoc } from '../schedules/repository'
import type { BusinessInput } from './schema'

/** `businesses` document (TRD section 3). */
export type BusinessDoc = {
  _id: ObjectId
  ownerUserId: string
  name: string
  slug: string
  timezone: string
  bookingCalendar?: { accountId: string; calendarId: string }
  publishableKey: string
  allowedOrigins: string[]
  createdAt: Date
  updatedAt: Date
}

export type CreateBusinessError = 'slug_taken'

/**
 * Admin access to businesses. Every function takes the owner's user id and
 * filters by `ownerUserId`; there is deliberately no unscoped read or write.
 * Pages should normally call `requireBusiness()` instead of these directly.
 */

async function businesses(): Promise<Collection<BusinessDoc>> {
  return (await getDb()).collection<BusinessDoc>(
    mongoDBConfig.collections.businesses,
  )
}

function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === id
    ? new ObjectId(id)
    : null
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 11000
  )
}

async function insertScheduleDoc(schedule: ScheduleDoc): Promise<void> {
  await (
    await getDb()
  )
    .collection<ScheduleDoc>(mongoDBConfig.collections.schedules)
    .insertOne(schedule)
}

export async function createBusiness(
  userId: string,
  input: BusinessInput,
  /** Replaceable in tests to prove the cleanup when this write fails. */
  insertSchedule: (schedule: ScheduleDoc) => Promise<void> = insertScheduleDoc,
): Promise<
  | { ok: true; business: BusinessDoc }
  | { ok: false; error: CreateBusinessError }
> {
  const col = await businesses()
  const now = new Date()
  const business: BusinessDoc = {
    _id: new ObjectId(),
    ownerUserId: userId,
    name: input.name,
    slug: input.slug,
    timezone: input.timezone,
    publishableKey: generatePublishableKey(),
    allowedOrigins: [],
    createdAt: now,
    updatedAt: now,
  }
  try {
    await col.insertOne(business)
  } catch (error) {
    // The unique indexes are the source of truth for slug uniqueness. A key
    // collision is astronomically unlikely, so only slugs are reported.
    if (isDuplicateKey(error)) return { ok: false, error: 'slug_taken' }
    throw error
  }
  // No transactions (TRD section 1), so compensate by hand: a business must
  // never be left without its first schedule. If the schedule cannot be
  // written, remove the business again so the owner can simply retry.
  try {
    await insertSchedule({
      _id: new ObjectId(),
      businessId: business._id,
      name: 'Working hours',
      timezone: input.timezone,
      weekly: defaultWeekly(),
      overrides: [],
      createdAt: now,
      updatedAt: now,
    })
  } catch (error) {
    await col.deleteOne({ _id: business._id, ownerUserId: userId })
    throw error
  }
  return { ok: true, business }
}

export async function listBusinessesForUser(
  userId: string,
): Promise<BusinessDoc[]> {
  return (await businesses())
    .find({ ownerUserId: userId })
    .sort({ createdAt: 1, _id: 1 })
    .toArray()
}

export async function getBusinessForUser(
  userId: string,
  businessId: string,
): Promise<BusinessDoc | null> {
  const _id = toObjectId(businessId)
  if (!_id) return null
  return (await businesses()).findOne({ _id, ownerUserId: userId })
}

export async function updateBusinessForUser(
  userId: string,
  businessId: string,
  input: BusinessInput,
): Promise<
  | { ok: true; business: BusinessDoc }
  | { ok: false; error: CreateBusinessError | 'not_found' }
> {
  const _id = toObjectId(businessId)
  if (!_id) return { ok: false, error: 'not_found' }
  try {
    const updated = await (
      await businesses()
    ).findOneAndUpdate(
      { _id, ownerUserId: userId },
      {
        $set: {
          name: input.name,
          slug: input.slug,
          timezone: input.timezone,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    )
    return updated
      ? { ok: true, business: updated }
      : { ok: false, error: 'not_found' }
  } catch (error) {
    if (isDuplicateKey(error)) return { ok: false, error: 'slug_taken' }
    throw error
  }
}

/**
 * The current business for a request: the one named by the remembered id if
 * this user owns it, otherwise their first. A forged or stale id falls back
 * safely. Null when the user has no business.
 */
export async function resolveCurrentBusiness(
  userId: string,
  rememberedId: string | undefined,
): Promise<{ current: BusinessDoc; all: BusinessDoc[] } | null> {
  const all = await listBusinessesForUser(userId)
  const current =
    all.find((b) => b._id.toHexString() === rememberedId) ?? all[0]
  if (!current) return null
  return { current, all }
}

const businessIdSchema = z.string().regex(/^[0-9a-f]{24}$/, 'Not a business id')

/**
 * The business a user asked to switch to, or null. The input comes straight
 * from a server action call, so it is untrusted: anything that is not a
 * canonical id of a business this user owns yields null.
 */
export async function resolveSwitchTarget(
  userId: string,
  rawBusinessId: unknown,
): Promise<BusinessDoc | null> {
  const parsed = businessIdSchema.safeParse(rawBusinessId)
  if (!parsed.success) return null
  return getBusinessForUser(userId, parsed.data)
}
