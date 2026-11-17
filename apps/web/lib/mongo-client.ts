import { MongoClient, type Db } from 'mongodb'

import { requireEnv } from './env'

const MONGO_CONNECTION_STRING = requireEnv('MONGO_CONNECTION_STRING')

let client: MongoClient | null = null
let clientPromise: Promise<MongoClient> | null = null

/**
 * One shared MongoDB client for application queries. OpenSlots must run on a
 * standalone server: do not use multi-document transactions (TRD section 1).
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(MONGO_CONNECTION_STRING)
    clientPromise = client.connect()
  }
  if (clientPromise) {
    await clientPromise
  }
  return client
}

export const mongoDBConfig = {
  dbName: `openslots-${process.env.NODE_ENV}`,
  /** Application collections (TRD section 3). Better Auth manages its own. */
  collections: {
    businesses: 'businesses',
    services: 'services',
    schedules: 'schedules',
    calendarLinks: 'calendar_links',
    bookings: 'bookings',
    slotLocks: 'slot_locks',
  },
} as const

export async function getDb(): Promise<Db> {
  return (await getMongoClient()).db(mongoDBConfig.dbName)
}

export async function closeMongoClient() {
  await client?.close()
  client = null
  clientPromise = null
}
