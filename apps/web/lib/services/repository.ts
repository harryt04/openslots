import { ObjectId, type Collection } from 'mongodb'

import { slugify } from '../businesses/slug'
import { getDb, mongoDBConfig } from '../mongo-client'
import type { ServiceFormValues } from './schema'

/** `services` document (TRD section 3). */
export type ServiceDoc = {
  _id: ObjectId
  businessId: ObjectId
  name: string
  slug: string
  description: string
  color: ServiceFormValues['color']
  durationMin: number
  bufferBeforeMin: number
  bufferAfterMin: number
  startIntervalMin: number
  minNoticeMin: number
  windowDays: number
  maxPerDay?: number
  scheduleId: ObjectId
  askPhone: boolean
  askNotes: boolean
  active: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Admin access to services. Every function takes the id of the current
 * business, which must come from `requireBusiness()`, and filters by it:
 * there is deliberately no way to reach a service by its id alone, so one
 * owner can never read or change another business's services.
 */

async function services(): Promise<Collection<ServiceDoc>> {
  return (await getDb()).collection<ServiceDoc>(
    mongoDBConfig.collections.services,
  )
}

/** A canonical 24-hex id, or null for anything else (including forged input). */
export function toObjectId(id: unknown): ObjectId | null {
  return typeof id === 'string' &&
    ObjectId.isValid(id) &&
    String(new ObjectId(id)) === id
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

/** The first choice of slug for a service name; never empty. */
export function baseServiceSlug(name: string): string {
  return slugify(name) || 'service'
}

/** `base`, then `base-2`, `base-3`, … */
export function slugCandidate(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}-${attempt + 1}`
}

/** Give up after this many collisions rather than loop forever. */
const MAX_SLUG_ATTEMPTS = 50

function fields(input: ServiceFormValues, scheduleId: ObjectId) {
  return {
    name: input.name,
    description: input.description,
    color: input.color,
    durationMin: input.durationMin,
    bufferBeforeMin: input.bufferBeforeMin,
    bufferAfterMin: input.bufferAfterMin,
    startIntervalMin: input.startIntervalMin,
    minNoticeMin: input.minNoticeMin,
    windowDays: input.windowDays,
    scheduleId,
    askPhone: input.askPhone,
    askNotes: input.askNotes,
  }
}

/**
 * Creates an active service. The slug comes from the name and is unique
 * within the business: the unique `{businessId, slug}` index decides, and a
 * duplicate-key error moves on to the next candidate (`trim`, `trim-2`, …),
 * so two concurrent creates can never end up with the same slug.
 *
 * `scheduleId` must already have been checked to belong to the business.
 */
export async function createService(
  businessId: ObjectId,
  input: ServiceFormValues,
  scheduleId: ObjectId,
): Promise<ServiceDoc> {
  const col = await services()
  const now = new Date()
  const base = baseServiceSlug(input.name)
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const doc: ServiceDoc = {
      _id: new ObjectId(),
      businessId,
      slug: slugCandidate(base, attempt),
      ...fields(input, scheduleId),
      ...(input.maxPerDay !== undefined ? { maxPerDay: input.maxPerDay } : {}),
      active: true,
      createdAt: now,
      updatedAt: now,
    }
    try {
      await col.insertOne(doc)
      return doc
    } catch (error) {
      if (isDuplicateKey(error)) continue
      throw error
    }
  }
  throw new Error(`No free slug for "${base}" after ${MAX_SLUG_ATTEMPTS} tries`)
}

export async function listServices(
  businessId: ObjectId,
): Promise<ServiceDoc[]> {
  return (await services())
    .find({ businessId })
    .sort({ createdAt: 1, _id: 1 })
    .toArray()
}

export async function countServices(businessId: ObjectId): Promise<number> {
  return (await services()).countDocuments({ businessId })
}

export async function getService(
  businessId: ObjectId,
  serviceId: unknown,
): Promise<ServiceDoc | null> {
  const _id = toObjectId(serviceId)
  if (!_id) return null
  return (await services()).findOne({ _id, businessId })
}

/**
 * Updates the editable fields. The slug is kept when the name changes, so
 * links the owner has already shared keep working.
 */
export async function updateService(
  businessId: ObjectId,
  serviceId: unknown,
  input: ServiceFormValues,
  scheduleId: ObjectId,
): Promise<ServiceDoc | null> {
  const _id = toObjectId(serviceId)
  if (!_id) return null
  const $set = { ...fields(input, scheduleId), updatedAt: new Date() }
  return (await services()).findOneAndUpdate(
    { _id, businessId },
    input.maxPerDay === undefined
      ? { $set, $unset: { maxPerDay: '' } }
      : { $set: { ...$set, maxPerDay: input.maxPerDay } },
    { returnDocument: 'after' },
  )
}

/** Pauses (`false`) or resumes (`true`) a service without deleting it. */
export async function setServiceActive(
  businessId: ObjectId,
  serviceId: unknown,
  active: boolean,
): Promise<ServiceDoc | null> {
  const _id = toObjectId(serviceId)
  if (!_id) return null
  return (await services()).findOneAndUpdate(
    { _id, businessId },
    { $set: { active, updatedAt: new Date() } },
    { returnDocument: 'after' },
  )
}

/** True when a service of this business was deleted. */
export async function deleteService(
  businessId: ObjectId,
  serviceId: unknown,
): Promise<boolean> {
  const _id = toObjectId(serviceId)
  if (!_id) return false
  const result = await (await services()).deleteOne({ _id, businessId })
  return result.deletedCount === 1
}
