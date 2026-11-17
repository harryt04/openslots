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

async function fixture() {
  const db = await client.getDb()
  const account = new ObjectId()
  await db
    .collection('account')
    .insertOne({ _id: account, userId: 'owner', providerId: 'google' })
  const result = await businesses.createBusiness('owner', {
    name: 'Focused test',
    slug: `test-${new ObjectId()}`,
    timezone: 'UTC',
  })
  if (!result.ok) throw Error('setup')
  const { FakeCalendarProvider, seedFakeCalendar } =
    await import('../calendar/fake')
  seedFakeCalendar(String(account))
  const provider = new FakeCalendarProvider(String(account))
  await repo.refreshLink(result.business, String(account), '', provider)
  return { business: result.business, accountId: String(account), provider, db }
}
it('unlinks the last account and unsets the destination', async () => {
  const { business, accountId } = await fixture()
  await repo.unlinkAccount(business, accountId)
  expect(await repo.listLinks(business._id)).toHaveLength(0)
  expect(
    (await businesses.getBusinessForUser('owner', String(business._id)))
      ?.bookingCalendar,
  ).toBeUndefined()
})
it('repairs concurrent unlink and choose to a valid or visibly unavailable state', async () => {
  const { business, accountId } = await fixture()
  await Promise.allSettled([
    repo.chooseBookingCalendar(business, accountId, 'primary'),
    repo.unlinkAccount(business, accountId),
  ])
  const fresh = (await businesses.getBusinessForUser(
    'owner',
    String(business._id),
  ))!
  expect(fresh.bookingCalendar).toBeUndefined()
  expect((await repo.calendarAvailability(fresh)).ok).toBe(false)
})
it('keeps reconnect status and its first failure date on transient failures', async () => {
  const { business, accountId, provider } = await fixture()
  await repo.markNeedsReconnect(business._id, accountId)
  const before = (await repo.listLinks(business._id))[0]!
  await repo.markNeedsReconnect(business._id, accountId)
  await repo.refreshLink(business, accountId, '', {
    ...provider,
    listCalendars: async () => {
      throw Error('temporary')
    },
  } as unknown as typeof provider)
  const after = (await repo.listLinks(business._id))[0]!
  expect(after.status).toBe('needs_reconnect')
  expect(after.needsReconnectSince).toEqual(before.needsReconnectSince)
  await repo.refreshLink(business, accountId, '', provider)
  expect(
    (await repo.listLinks(business._id))[0]?.needsReconnectSince,
  ).toBeUndefined()
})
it('rejects foreign account choices and leaves blocking unchanged in a populated business', async () => {
  const a = await fixture(),
    b = await fixture()
  await repo.setBlocking(a.business._id, b.accountId, 'primary', false)
  await expect(
    repo.chooseBookingCalendar(a.business, b.accountId, 'primary'),
  ).rejects.toThrow()
  expect((await repo.listLinks(b.business._id))[0]?.calendars[0]?.blocks).toBe(
    true,
  )
})
it('consumes return intent once, connects only a new identity, and rejects wrong scopes', async () => {
  const a = await fixture()
  const { beginReturn, finishReturn } = await import('./returns')
  const nonce = await beginReturn(a.business, 'owner')
  await repo.unlinkAccount(a.business, a.accountId)
  const added = new ObjectId()
  await a.db
    .collection('account')
    .insertOne({ _id: added, userId: 'owner', providerId: 'google' })
  const { calendarProvider } = await import('../calendar')
  vi.mocked(calendarProvider).mockReturnValue(a.provider)
  await finishReturn(a.business, 'someone-else', nonce)
  const b = await fixture()
  await finishReturn(b.business, 'owner', nonce)
  await finishReturn(a.business, 'owner', 'invalid')
  expect(await repo.listLinks(a.business._id)).toHaveLength(0)
  // b was added after the snapshot too: ambiguous returns must do nothing.
  await a.db.collection('account').deleteOne({ _id: new ObjectId(b.accountId) })
  await finishReturn(a.business, 'owner', nonce)
  expect(
    (await repo.listLinks(a.business._id)).map((l) => l.accountId),
  ).toEqual([String(added)])
  await repo.unlinkAccount(a.business, String(added))
  await finishReturn(a.business, 'owner', nonce)
  expect(await repo.listLinks(a.business._id)).toHaveLength(0)
  const reconnect = await beginReturn(a.business, 'owner', String(added))
  await finishReturn(a.business, 'owner', reconnect)
  expect(
    (await repo.listLinks(a.business._id)).map((l) => l.accountId),
  ).toEqual([String(added)])
})

it.each(['disappeared', 'read-only'])(
  'moves a %s destination to the first writable calendar',
  async (mode) => {
    const { business, accountId, provider } = await fixture()
    const { seedFakeCalendar } = await import('../calendar/fake')
    seedFakeCalendar(accountId, {
      calendars: [
        ...(mode === 'read-only'
          ? [
              {
                id: 'primary',
                primary: true,
                summary: 'Old',
                accessRole: 'reader' as const,
              },
            ]
          : []),
        { id: 'replacement', summary: 'Replacement', accessRole: 'writer' },
      ],
    })
    const result = await repo.refreshLink(business, accountId, '', provider)
    expect(result.message).toContain('moved')
    const fresh = (await businesses.getBusinessForUser(
      'owner',
      String(business._id),
    ))!
    expect(fresh.bookingCalendar?.calendarId).toBe('replacement')
    expect((await repo.calendarAvailability(fresh)).ok).toBe(true)
  },
)
it('reports no writable calendars accurately and fails closed', async () => {
  const { business, accountId, provider } = await fixture()
  const { seedFakeCalendar } = await import('../calendar/fake')
  seedFakeCalendar(accountId, {
    calendars: [{ id: 'readonly', summary: 'Read only', accessRole: 'reader' }],
  })
  expect(
    (await repo.refreshLink(business, accountId, '', provider)).message,
  ).toContain('No writable calendar')
  const fresh = (await businesses.getBusinessForUser(
    'owner',
    String(business._id),
  ))!
  expect(fresh.bookingCalendar).toBeUndefined()
  expect((await repo.calendarAvailability(fresh)).ok).toBe(false)
})
it('refuses refresh of a Google account owned by another user', async () => {
  const { business, db } = await fixture()
  const id = new ObjectId()
  await db
    .collection('account')
    .insertOne({ _id: id, userId: 'other', providerId: 'google' })
  await expect(repo.refreshLink(business, String(id), '')).rejects.toThrow(
    'not owned',
  )
})
it('uses the linked identity id-token email instead of the owner email', async () => {
  const { business, accountId, db, provider } = await fixture()
  const payload = Buffer.from(
    JSON.stringify({ email: 'second@example.test', email_verified: true }),
  ).toString('base64url')
  await db
    .collection('account')
    .updateOne(
      { _id: new ObjectId(accountId) },
      { $set: { idToken: `header.${payload}.signature` } },
    )
  await repo.refreshLink(business, accountId, 'owner@example.test', provider)
  expect((await repo.listLinks(business._id))[0]?.email).toBe(
    'second@example.test',
  )
})
