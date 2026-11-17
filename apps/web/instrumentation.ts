/**
 * Runs once when the server starts (Next.js instrumentation hook).
 *
 * Creates the MongoDB indexes the app relies on, so a fresh install needs no
 * separate step. Index creation is idempotent. If it fails, the server still
 * starts so the owner can sign in and see what is wrong, but the booking
 * endpoints refuse to serve until the unique `slot_locks` index exists
 * (TRD section 3). Set OPENSLOTS_AUTO_INDEX=0 to manage indexes yourself with
 * `pnpm run create-indexes`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
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
