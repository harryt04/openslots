/**
 * Runs once when the server starts (Next.js instrumentation hook).
 *
 * In production it refuses to start in fake mode, then creates the MongoDB
 * indexes the app relies on, so a fresh install needs no separate step. Index
 * creation is idempotent. If it fails, the server still starts so the owner
 * can sign in and see what is wrong, but the booking endpoints refuse to
 * serve until the unique `slot_locks` index exists (TRD section 3). Set
 * OPENSLOTS_AUTO_INDEX=0 to manage indexes yourself with
 * `pnpm run create-indexes`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { onServerStart } = await import('./instrumentation-node')
    await onServerStart()
  }
}
