import { isFakeGoogle } from './lib/env'

/**
 * Server start-up work that needs Node.js. Kept apart from instrumentation.ts
 * because that file is also compiled for the edge runtime.
 */
export async function onServerStart() {
  // Fake mode must never run in production (TRD section 10). Next logs a
  // failed instrumentation hook and keeps running, so stop the process here.
  try {
    isFakeGoogle()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }

  if (process.env.NODE_ENV !== 'production') return
  if (process.env.OPENSLOTS_AUTO_INDEX === '0') return
  try {
    const { mongoDBConfig } = await import('./lib/mongo-client')
    const { createMongoDbIndexes } = await import('./lib/mongo-utils')
    await createMongoDbIndexes(mongoDBConfig.dbName)
  } catch (error) {
    console.error(
      'OpenSlots could not create its MongoDB indexes. Bookings stay disabled until they exist.',
      error instanceof Error ? error.message : error,
    )
  }
}
