import { MongoMemoryServer } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'
import { beforeAll, afterAll, it, expect, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('../calendar', async () => ({
  ...(await import('../calendar/types')),
  calendarProvider: vi.fn(),
}))
let mongo: MongoMemoryServer
let client: typeof import('../mongo-client')
let repo: typeof import('./repository')
let businesses: typeof import('../businesses/repository')
beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  client = await import('../mongo-client')
  repo = await import('./repository')
  businesses = await import('../businesses/repository')
  await (
    await import('../mongo-utils')
  ).createMongoDbIndexes(client.mongoDBConfig.dbName)
})
afterAll(async () => {
  await client.closeMongoClient()
  await mongo.stop()
})
it('isolates businesses, checks account ownership and preserves a single destination', async () => {
  const { FakeCalendarProvider, seedFakeCalendar } =
    await import('../calendar/fake')
  const { CalendarError } = await import('../calendar/types')
  const db = await client.getDb()
  const account = new ObjectId(),
    other = new ObjectId()
  await db.collection('account').insertMany([
    { _id: account, userId: 'owner', providerId: 'google' },
    { _id: other, userId: 'other', providerId: 'google' },
  ])
  const a = await businesses.createBusiness('owner', {
    name: 'A',
    slug: 'test-a',
    timezone: 'UTC',
  })
  const b = await businesses.createBusiness('owner', {
    name: 'B',
    slug: 'test-b',
    timezone: 'UTC',
  })
  if (!a.ok || !b.ok) throw Error('setup')
  expect(await repo.calendarAvailability(a.business)).toEqual({
    ok: false,
    reason: 'calendar_unavailable',
  })
  await expect(
    repo.refreshLink(a.business, String(other), 'owner@example.com'),
  ).rejects.toThrow('not owned')
  seedFakeCalendar(String(account), {
    calendars: [
      { id: 'primary', primary: true, summary: 'Work', accessRole: 'owner' },
      { id: 'shared', summary: 'Shared', accessRole: 'writer' },
      { id: 'holiday', summary: 'Holidays', accessRole: 'reader' },
    ],
  })
  const provider = new FakeCalendarProvider(String(account))
  await repo.refreshLink(
    a.business,
    String(account),
    'owner@example.com',
    provider,
  )
  expect(await repo.listLinks(b.business._id)).toEqual([])
  await repo.setBlocking(b.business._id, String(account), 'primary', false)
  await repo.unlinkAccount(b.business, String(account))
  expect((await repo.listLinks(a.business._id))[0]?.calendars[0]?.blocks).toBe(
    true,
  )
  let fresh = (await businesses.getBusinessForUser(
    'owner',
    String(a.business._id),
  ))!
  expect(fresh.bookingCalendar?.calendarId).toBe('primary')
  await expect(
    repo.chooseBookingCalendar(fresh, String(account), 'holiday'),
  ).rejects.toThrow()
  await repo.chooseBookingCalendar(fresh, String(account), 'shared')
  fresh = (await businesses.getBusinessForUser(
    'owner',
    String(a.business._id),
  ))!
  expect(fresh.bookingCalendar?.calendarId).toBe('shared')
  await expect(repo.unlinkAccount(fresh, String(account))).rejects.toThrow()
  expect((await repo.calendarAvailability(fresh)).ok).toBe(true)
  const transient = {
    ...provider,
    listCalendars: async () => {
      throw new CalendarError(403)
    },
  } as unknown as typeof provider
  await repo.refreshLink(fresh, String(account), '', transient)
  expect((await repo.listLinks(fresh._id))[0]?.status).toBe('ok')
  seedFakeCalendar(String(account), { authFailure: true })
  await repo.refreshLink(fresh, String(account), '', provider)
  expect((await repo.listLinks(fresh._id))[0]?.status).toBe('needs_reconnect')
  expect(await repo.calendarAvailability(fresh)).toEqual({
    ok: false,
    reason: 'calendar_unavailable',
  })
  const secondId = new ObjectId()
  await db
    .collection('account')
    .insertOne({ _id: secondId, userId: 'owner', providerId: 'google' })
  seedFakeCalendar(String(secondId))
  await repo.refreshLink(
    fresh,
    String(secondId),
    'second@example.com',
    new FakeCalendarProvider(String(secondId)),
  )
  await repo.chooseBookingCalendar(fresh, String(secondId), 'primary')
  fresh = (await businesses.getBusinessForUser(
    'owner',
    String(a.business._id),
  ))!
  await repo.unlinkAccount(fresh, String(account))
  expect(await repo.listLinks(fresh._id)).toHaveLength(1)
  expect((await repo.calendarAvailability(fresh)).ok).toBe(true)
  // Relink the original account and restore its destination for disappearance testing.
  seedFakeCalendar(String(account), {
    calendars: [{ id: 'shared', summary: 'Shared', accessRole: 'writer' }],
  })
  await repo.refreshLink(fresh, String(account), '', provider)
  await repo.chooseBookingCalendar(fresh, String(account), 'shared')
  fresh = (await businesses.getBusinessForUser(
    'owner',
    String(a.business._id),
  ))!
  seedFakeCalendar(String(account))
  await repo.refreshLink(fresh, String(account), '', provider)
  expect((await repo.calendarAvailability(fresh)).ok).toBe(false) // disappeared destination fails closed
})
