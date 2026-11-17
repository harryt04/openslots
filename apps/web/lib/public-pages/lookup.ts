import { manageTokenSchema, slugSchema } from '@openslots/core'
import { ObjectId } from 'mongodb'

import type { BusinessDoc } from '../businesses/repository'
import { getDb, mongoDBConfig } from '../mongo-client'
import { tokenHash } from '../public-api/security'
import type { ServiceDoc } from '../services/repository'

/**
 * Read-only lookups for the public pages (`/b/...`, `/m/...`). These are the
 * only places outside the public API that reach a business without an
 * owner. They return only what the public already sees (name, timezone,
 * active services) plus the business's publishable key, which is public by
 * design, and never customer data. The pages themselves call the public API.
 */

export type PublicBusiness = {
  id: string
  name: string
  slug: string
  timezone: string
  publishableKey: string
}

export type PublicServiceInfo = {
  id: string
  name: string
  slug: string
  description: string
  durationMin: number
}

function toPublicBusiness(doc: BusinessDoc): PublicBusiness {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    slug: doc.slug,
    timezone: doc.timezone,
    publishableKey: doc.publishableKey,
  }
}

/** The business with this URL slug, or null. */
export async function findBusinessBySlug(
  slug: string,
): Promise<PublicBusiness | null> {
  if (!slugSchema.safeParse(slug).success) return null
  const doc = await (
    await getDb()
  )
    .collection<BusinessDoc>(mongoDBConfig.collections.businesses)
    .findOne({ slug })
  return doc ? toPublicBusiness(doc) : null
}

/**
 * An active (bookable) service of this business, by slug. A paused or
 * unknown service gives null, the same as an unknown business would.
 */
export async function findActiveServiceBySlug(
  businessId: string,
  slug: string,
): Promise<PublicServiceInfo | null> {
  if (!slugSchema.safeParse(slug).success || !ObjectId.isValid(businessId))
    return null
  const doc = await (
    await getDb()
  )
    .collection<ServiceDoc>(mongoDBConfig.collections.services)
    .findOne({ businessId: new ObjectId(businessId), slug, active: true })
  return doc
    ? {
        id: doc._id.toHexString(),
        name: doc.name,
        slug: doc.slug,
        description: doc.description,
        durationMin: doc.durationMin,
      }
    : null
}

/**
 * The business a manage token belongs to, so the page can call the manage
 * endpoints with that business's key. Null for a malformed or unknown token,
 * or one whose booking was abandoned before it was ever confirmed.
 * The business comes only from the booking found by the token's hash.
 */
export async function findBusinessForManageToken(
  token: string,
): Promise<PublicBusiness | null> {
  if (!manageTokenSchema.safeParse(token).success) return null
  const db = await getDb()
  const booking = await db
    .collection<{ businessId: ObjectId }>(mongoDBConfig.collections.bookings)
    .findOne(
      { manageTokenHash: tokenHash(token), abandoned: { $ne: true } },
      { projection: { businessId: 1 } },
    )
  if (!booking) return null
  const doc = await db
    .collection<BusinessDoc>(mongoDBConfig.collections.businesses)
    .findOne({ _id: booking.businessId })
  return doc ? toPublicBusiness(doc) : null
}

/** This instance's own origin, which the public API always allows. */
export function instanceOrigin(): string {
  return new URL(process.env.BETTER_AUTH_URL!).origin
}
