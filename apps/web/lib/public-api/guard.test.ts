import { it, expect, vi } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
vi.mock('server-only', () => ({}))
vi.mock('../calendar', async () => ({
  ...(await import('../calendar/types')),
  calendarProvider: vi.fn(),
}))
it('refuses booking writes without the unique slot lock index and logs a clear diagnostic', async () => {
  const mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  const client = await import('../mongo-client')
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const { guardLocks } = await import('../bookings/service')
    await expect(guardLocks()).rejects.toMatchObject({ code: 'internal_error' })
    await expect(guardLocks()).rejects.toMatchObject({ code: 'internal_error' })
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]?.[0]).toContain('slot_locks')
    const db = await client.getDb()
    await db
      .collection('slot_locks')
      .createIndex({ businessId: 1, block: 1 }, { unique: true })
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000)
    try {
      await expect(guardLocks()).resolves.toBeUndefined()
    } finally {
      clock.mockRestore()
    }
  } finally {
    log.mockRestore()
    await client.closeMongoClient()
    await mongo.stop()
  }
})
