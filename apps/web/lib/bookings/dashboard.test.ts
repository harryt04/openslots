import { MongoMemoryServer } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'
import { beforeAll, afterAll, it, expect, vi } from 'vitest'
vi.mock('server-only', () => ({}))
let mongo: MongoMemoryServer
let client: typeof import('../mongo-client')
beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  client = await import('../mongo-client')
})
afterAll(async () => {
  await client.closeMongoClient()
  await mongo.stop()
})
it('groups midnight and both sides of daylight saving by business date', async () => {
  const { dayGroups } = await import('./dashboard')
  const rows = [
    '2026-11-01T03:30:00Z',
    '2026-11-01T05:30:00Z',
    '2026-11-01T06:30:00Z',
  ].map((start) => ({ start: new Date(start) }))
  expect(
    dayGroups(rows, 'America/New_York').map((g) => [g.day, g.items.length]),
  ).toEqual([
    ['2026-10-31', 1],
    ['2026-11-01', 2],
  ])
})
it('bounds tabs, escapes search, excludes abandoned and other tenants, and counts snapshot hours', async () => {
  const { dashboardRows, dashboardStats, upcomingCount } =
    await import('./dashboard')
  const { getBooking } = await import('./repository')
  const id = new ObjectId(),
    other = new ObjectId(),
    now = new Date('2026-11-02T12:00:00Z')
  const foreign = new ObjectId()
  await (await client.getDb()).collection('bookings').insertMany([
    {
      _id: new ObjectId(),
      businessId: id,
      start: new Date('2026-11-02T14:00Z'),
      status: 'confirmed',
      customer: { name: 'A.*[x]', email: 'a@test' },
      service: { durationMin: 90 },
    },
    {
      businessId: id,
      start: new Date('2026-11-01T14:00Z'),
      status: 'confirmed',
    },
    {
      businessId: id,
      start: new Date('2026-11-03T14:00Z'),
      status: 'cancelled',
    },
    {
      businessId: id,
      start: new Date('2026-11-03T14:00Z'),
      status: 'confirmed',
      abandoned: true,
    },
    {
      _id: foreign,
      businessId: other,
      start: new Date('2026-11-03T14:00Z'),
      status: 'confirmed',
    },
  ])
  expect(await dashboardRows(id, 'upcoming', '', 0, now)).toHaveLength(1)
  expect(await dashboardRows(id, 'past', '', 0, now)).toHaveLength(1)
  expect(await dashboardRows(id, 'cancelled', '', 0, now)).toHaveLength(1)
  expect(await dashboardRows(id, 'upcoming', '.*[x]', 0, now)).toHaveLength(1)
  expect(await dashboardRows(id, 'upcoming', '[y]', 0, now)).toHaveLength(0)
  expect(await getBooking(id, foreign)).toBeNull()
  expect(await upcomingCount(id, now)).toBe(1)
  expect(await dashboardStats(id, 'UTC', now)).toMatchObject({
    today: 1,
    week: 1,
    hours: 1.5,
  })
})
