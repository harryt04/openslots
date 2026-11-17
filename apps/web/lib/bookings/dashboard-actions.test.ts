import { MongoMemoryServer } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'
import { beforeAll, afterAll, it, expect, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const tenant = vi.hoisted(() => ({ business: {} as { _id: ObjectId } }))
vi.mock('../businesses/current', () => ({
  requireBusiness: async () => tenant,
}))
const writes = vi.hoisted(() => ({
  cancelBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
}))
vi.mock('./service', () => writes)
let mongo: MongoMemoryServer
let client: typeof import('../mongo-client')
beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  client = await import('../mongo-client')
  tenant.business = { _id: new ObjectId() }
})
afterAll(async () => {
  await client.closeMongoClient()
  await mongo.stop()
})
it('never cancels or reschedules a foreign or abandoned booking', async () => {
  const { changeBooking } =
    await import('../../app/(dashboard)/bookings/actions')
  const foreign = new ObjectId(),
    abandoned = new ObjectId()
  await (await client.getDb()).collection('bookings').insertMany([
    { _id: foreign, businessId: new ObjectId() },
    { _id: abandoned, businessId: tenant.business._id, abandoned: true },
  ])
  for (const id of [foreign, abandoned])
    for (const action of ['cancel', 'reschedule'])
      expect(
        await changeBooking({
          id: String(id),
          action,
          start: '2026-12-01T12:00:00Z',
        }),
      ).toEqual({ error: 'Booking not found.' })
  expect(writes.cancelBooking).not.toHaveBeenCalled()
  expect(writes.rescheduleBooking).not.toHaveBeenCalled()
})
