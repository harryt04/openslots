import { MongoMemoryServer } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const guard = vi.hoisted(() => ({
  signedIn: true,
  business: {} as import('./businesses/repository').BusinessDoc,
  session: { user: { id: 'owner-a', email: 'a@example.test' } },
  setCookie: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: guard.setCookie }),
}))
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw Error('redirect')
  },
}))
vi.mock('./session', () => ({
  requireSession: async () => {
    if (!guard.signedIn) throw Error('no session')
    return guard.session
  },
}))
vi.mock('./businesses/current', () => ({
  CURRENT_BUSINESS_COOKIE: 'openslots_business',
  requireBusiness: async () => {
    if (!guard.signedIn) throw Error('no session')
    return guard
  },
}))
let mongo: MongoMemoryServer
let client: typeof import('./mongo-client')
beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  process.env.E2E_FAKE_GOOGLE = '1'
  client = await import('./mongo-client')
})
afterAll(async () => {
  await client.closeMongoClient()
  await mongo.stop()
})
test('business, developer, calendar actions and OAuth routes cannot target another owner', async () => {
  const db = await client.getDb()
  const now = new Date()
  guard.business = {
    _id: new ObjectId(),
    ownerUserId: 'owner-a',
    name: 'A',
    slug: 'shop-a',
    timezone: 'UTC',
    publishableKey: 'os_pk_' + 'a'.repeat(32),
    allowedOrigins: [],
    createdAt: now,
    updatedAt: now,
  }
  const foreign = {
    ...guard.business,
    _id: new ObjectId(),
    ownerUserId: 'owner-b',
    name: 'Private B',
    slug: 'private-b',
  }
  const account = {
    _id: new ObjectId(),
    userId: 'owner-b',
    providerId: 'google',
    email: 'private@example.test',
  }
  await db.collection('businesses').insertMany([guard.business, foreign])
  await db.collection('account').insertOne(account)
  const { createBusinessAction, updateBusinessAction, switchBusinessAction } =
    await import('../app/actions/business')
  const { updateDeveloperSettings } =
    await import('../app/(dashboard)/developers/actions')
  const { mutateCalendar } =
    await import('../app/(dashboard)/calendars/actions')
  const { POST } = await import('../app/(dashboard)/calendars/link/route')
  const { GET } = await import('../app/(dashboard)/calendars/return/route')
  const input = {
    name: 'Safe own change',
    slug: 'own-change',
    timezone: 'UTC',
    businessId: String(foreign._id),
    ownerUserId: 'owner-b',
  }
  expect(await updateBusinessAction(input)).toEqual({ ok: true })
  expect(
    await createBusinessAction({ ...input, slug: 'new-owned' }),
  ).toMatchObject({ ok: true })
  expect(
    await db.collection('businesses').findOne({ slug: 'new-owned' }),
  ).toMatchObject({ ownerUserId: 'owner-a' })
  guard.setCookie.mockClear()
  for (const id of [String(foreign._id), 'malformed', null]) {
    await expect(switchBusinessAction(id)).rejects.toThrow('redirect')
    expect(guard.setCookie).not.toHaveBeenCalled()
  }
  for (const action of ['rotate', 'add', 'remove'] as const)
    await updateDeveloperSettings(action, 'https://allowed.example.test')
  expect(await updateDeveloperSettings('add', 'malformed')).toHaveProperty(
    'error',
  )
  for (const id of [String(account._id), 'malformed']) {
    for (const operation of [
      'connect',
      'refresh',
      'block',
      'booking',
      'unlink',
    ] as const) {
      const result = await mutateCalendar({
        operation,
        accountId: id,
        calendarId: 'primary',
        blocks: true,
      })
      expect(result).not.toContain('Private B')
      expect(result).not.toContain(account.email)
    }
    await expect(
      POST(
        new Request('http://localhost/calendars/link', {
          method: 'POST',
          body: JSON.stringify({ accountId: id }),
        }),
      ),
    ).rejects.toThrow('Account not owned')
  }
  const nonce = 'x'.repeat(43)
  const intent = {
    _id: new ObjectId(),
    nonce,
    userId: 'owner-b',
    businessId: foreign._id,
    expiresAt: new Date(Date.now() + 60000),
  }
  await db.collection('calendar_link_returns').insertOne(intent)
  for (const value of [nonce, 'bad']) {
    const response = await GET(
      new Request(`http://localhost/calendars/return?nonce=${value}`),
    )
    expect(response.headers.get('location')).toBe('http://localhost/calendars')
  }
  expect(
    await db.collection('calendar_link_returns').findOne({ _id: intent._id }),
  ).toEqual(intent)
  expect(
    await db.collection('businesses').findOne({ _id: foreign._id }),
  ).toEqual(foreign)
  expect(await db.collection('account').findOne({ _id: account._id })).toEqual(
    account,
  )
  expect(await db.collection('calendar_links').countDocuments()).toBe(0)
  expect(await createBusinessAction(null)).toMatchObject({ ok: false })
  expect(await updateBusinessAction(null)).toMatchObject({ ok: false })
  guard.signedIn = false
  const before = await db.collection('businesses').find().toArray()
  try {
    const attempts = [
      () => createBusinessAction(input),
      () => updateBusinessAction(input),
      () => switchBusinessAction(String(foreign._id)),
      () => updateDeveloperSettings('rotate'),
      () =>
        mutateCalendar({ operation: 'unlink', accountId: String(account._id) }),
      () =>
        POST(
          new Request('http://localhost/calendars/link', {
            method: 'POST',
            body: '{}',
          }),
        ),
      () =>
        GET(new Request('http://localhost/calendars/return?nonce=' + nonce)),
    ]
    for (const attempt of attempts)
      await expect(attempt()).rejects.toThrow('no session')
    expect(await db.collection('businesses').find().toArray()).toEqual(before)
  } finally {
    guard.signedIn = true
  }
})
