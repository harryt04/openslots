import type { IndexDescription } from 'mongodb'

import { getMongoClient, mongoDBConfig } from './mongo-client'

type CollectionName =
  (typeof mongoDBConfig.collections)[keyof typeof mongoDBConfig.collections]

/**
 * Every index the app relies on, by collection (TRD section 3).
 * `pnpm run create-indexes` applies them; `dev:fake` applies them on start.
 * Better Auth manages its own collections' indexes.
 */
export const indexes: Record<CollectionName, IndexDescription[]> = {
  businesses: [
    { key: { slug: 1 }, name: 'slug_unique', unique: true },
    {
      key: { publishableKey: 1 },
      name: 'publishableKey_unique',
      unique: true,
    },
    { key: { ownerUserId: 1 }, name: 'ownerUserId' },
  ],
  services: [
    {
      key: { businessId: 1, slug: 1 },
      name: 'businessId_slug_unique',
      unique: true,
    },
  ],
  schedules: [{ key: { businessId: 1 }, name: 'businessId' }],
  calendar_link_returns: [
    { key: { nonce: 1 }, unique: true, name: 'nonce_unique' },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'expiresAt_ttl' },
  ],
  calendar_links: [
    {
      key: { businessId: 1, accountId: 1 },
      name: 'businessId_accountId_unique',
      unique: true,
    },
  ],
  booking_day_counts: [{ key: { _id: 1 }, name: '_id_' }],
  bookings: [
    { key: { status: 1, deadline: 1 }, name: 'attempt_deadline' },
    { key: { businessId: 1, start: 1 }, name: 'businessId_start' },
    {
      key: { manageTokenHash: 1 },
      name: 'manageTokenHash_unique',
      unique: true,
    },
    {
      key: { businessId: 1, status: 1, start: 1 },
      name: 'businessId_status_start',
    },
  ],
  api_rate_limits: [
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'expiresAt_ttl' },
  ],
  slot_locks: [
    // Booking correctness depends on this index (TRD section 5).
    {
      key: { businessId: 1, block: 1 },
      name: 'businessId_block_unique',
      unique: true,
    },
    { key: { bookingId: 1 }, name: 'bookingId' },
  ],
}

/** Idempotent: safe to run on every start and in every deploy. */
export async function createMongoDbIndexes(dbName: string) {
  console.log(`Ensuring indexes for db: ${dbName} ...`)
  const client = await getMongoClient()
  const db = client.db(dbName)

  const existing = new Set(
    (await db.listCollections().toArray()).map((c) => c.name),
  )

  for (const [collectionName, specs] of Object.entries(indexes)) {
    if (!specs.length) continue
    if (!existing.has(collectionName)) {
      console.log(`Creating collection "${collectionName}"`)
      await db.createCollection(collectionName)
    }
    await db.collection(collectionName).createIndexes(specs)
  }

  console.log(`Indexes ensured for db: ${dbName}`)
}
