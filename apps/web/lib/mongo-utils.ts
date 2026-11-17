import type { IndexDescription } from 'mongodb'

import { getMongoClient, mongoDBConfig } from './mongo-client'

type CollectionName =
  (typeof mongoDBConfig.collections)[keyof typeof mongoDBConfig.collections]

/**
 * Every index the app relies on, by collection (TRD section 3).
 * Slices add theirs here; `pnpm run create-indexes` applies them.
 */
export const indexes: Partial<Record<CollectionName, IndexDescription[]>> = {}

export async function createMongoDbIndexes(dbName: string) {
  console.log(`Ensuring indexes for db: ${dbName} ...`)
  const client = await getMongoClient()
  const db = client.db(dbName)

  const existing = new Set(
    (await db.listCollections().toArray()).map((c) => c.name),
  )

  for (const [collectionName, specs] of Object.entries(indexes)) {
    if (!specs?.length) continue
    if (!existing.has(collectionName)) {
      console.log(`Creating collection "${collectionName}"`)
      await db.createCollection(collectionName)
    }
    await db.collection(collectionName).createIndexes(specs)
  }

  console.log(`Indexes ensured for db: ${dbName}`)
}
