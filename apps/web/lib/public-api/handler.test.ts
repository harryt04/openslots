import { MongoMemoryServer } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'
import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('../calendar', async () => {
  const { FakeCalendarProvider } = await import('../calendar/fake')
  return {
    ...(await import('../calendar/types')),
    calendarProvider: (a: { id: string }) => new FakeCalendarProvider(a.id),
    eventIdForBooking: (id: string) => id,
  }
})
let mongo: MongoMemoryServer
let client: typeof import('../mongo-client')
let handle: (typeof import('./handler'))['handle']
let business: import('../businesses/repository').BusinessDoc
let service: ObjectId
let state: import('../calendar/fake').FakeState
const account = new ObjectId()
const start = new Date(Date.now() + 86400000 * 2)
start.setUTCHours(10, 0, 0, 0)
const iso = start.toISOString()
async function call(
  route: Parameters<typeof handle>[1],
  body?: unknown,
  token?: string,
  headers: Record<string, string> = {},
) {
  return handle(
    new Request('http://localhost:3201/api/v1/' + route, {
      method: body ? 'POST' : 'GET',
      headers: { 'X-OpenSlots-Key': business.publishableKey, ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    route,
    token,
  )
}
const input = (time = iso) => ({
  serviceId: String(service),
  start: time,
  timezone: 'UTC',
  customer: { name: 'Customer', email: 'customer@example.test' },
})
beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  process.env.BETTER_AUTH_URL = 'http://localhost:3201'
  client = await import('../mongo-client')
  handle = (await import('./handler')).handle
  await (
    await import('../mongo-utils')
  ).createMongoDbIndexes(client.mongoDBConfig.dbName)
})
beforeEach(async () => {
  const db = await client.getDb()
  for (const name of [
    'bookings',
    'slot_locks',
    'businesses',
    'services',
    'schedules',
    'calendar_links',
    'account',
    'api_rate_limits',
  ])
    await db.collection(name).deleteMany({})
  const id = new ObjectId(),
    schedule = new ObjectId()
  service = new ObjectId()
  business = {
    _id: id,
    ownerUserId: 'owner',
    name: 'Salon',
    slug: 'salon',
    timezone: 'UTC',
    publishableKey: 'os_pk_abcdefghijklmnopqrstuvwx',
    allowedOrigins: ['https://example.test'],
    bookingCalendar: { accountId: String(account), calendarId: 'primary' },
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  await db.collection('businesses').insertOne(business)
  await db
    .collection('account')
    .insertOne({ _id: account, userId: 'owner', providerId: 'google' })
  await db.collection('calendar_links').insertOne({
    businessId: id,
    accountId: String(account),
    status: 'ok',
    calendars: [{ calendarId: 'primary', blocks: true, writable: true }],
  })
  await db.collection('schedules').insertOne({
    _id: schedule,
    name: 'Hours',
    businessId: id,
    timezone: 'UTC',
    weekly: Array.from({ length: 7 }, () => [{ startMin: 0, endMin: 1440 }]),
    overrides: [],
  })
  await db.collection('services').insertOne({
    _id: service,
    businessId: id,
    name: 'Cut',
    slug: 'cut',
    description: '',
    color: 'blue',
    durationMin: 60,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    startIntervalMin: 5,
    minNoticeMin: 0,
    windowDays: 30,
    scheduleId: schedule,
    active: true,
    askPhone: false,
    askNotes: false,
  })
  state = (await import('../calendar/fake')).seedFakeCalendar(String(account))
})
afterAll(async () => {
  await client.closeMongoClient()
  await mongo.stop()
})
for (let run = 0; run < 3; run++)
  it(`20 concurrent overlapping creates: one winner (${run})`, async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        call(
          'bookings',
          input(
            new Date(
              +start + (run === 0 ? 0 : i % 3) * 5 * 60000,
            ).toISOString(),
          ),
        ),
      ),
    )
    const results = await Promise.all(
      responses.map(async (response) =>
        response.status === 201 ? 201 : (await response.json()).error.code,
      ),
    )
    expect(results.filter((r) => r === 201)).toHaveLength(1)
    expect(results.filter((r) => r === 'slot_taken')).toHaveLength(19)
    const db = await client.getDb()
    expect(
      await db.collection('bookings').countDocuments({ status: 'confirmed' }),
    ).toBe(1)
    expect(await db.collection('slot_locks').countDocuments()).toBe(12)
    expect(Object.keys(state.events)).toHaveLength(1)
  })
it('route journey and tenant token isolation', async () => {
  const response = await call('bookings', input())
  expect(response.status).toBe(201)
  const created = await response.json()
  const token = created.manageUrl.split('/').pop()
  expect((await call('manage', undefined, token)).status).toBe(200)
  expect((await call('manage', undefined, 'a'.repeat(43))).status).toBe(404)
  expect(
    (
      await call(
        'reschedule',
        { start: new Date(+start + 7200000).toISOString() },
        token,
      )
    ).status,
  ).toBe(200)
  expect(state.operations.map((o) => o.kind)).toEqual(['create', 'update'])
  expect((await call('cancel', {}, token)).status).toBe(200)
  expect(Object.keys(state.events)).toHaveLength(0)
  expect(
    await (await client.getDb()).collection('slot_locks').countDocuments(),
  ).toBe(0)
  expect((await call('cancel', {}, token)).status).toBe(409)
})
it('CORS, validation, honeypot and rate limit', async () => {
  expect(
    (
      await call('business', undefined, undefined, {
        Origin: 'https://evil.test',
      })
    ).status,
  ).toBe(403)
  expect(
    (
      await call('business', undefined, undefined, {
        Origin: 'https://example.test',
      })
    ).headers.get('Access-Control-Allow-Origin'),
  ).toBe('https://example.test')
  expect((await call('bookings', {})).status).toBe(400)
  expect((await call('bookings', { ...input(), website: 'spam' })).status).toBe(
    201,
  )
  expect(
    await (await client.getDb()).collection('bookings').countDocuments(),
  ).toBe(0)
  for (let i = 0; i < 28; i++) await call('bookings', {})
  const limited = await call('bookings', {})
  expect(limited.status).toBe(429)
  expect(limited.headers.has('Retry-After')).toBe(true)
})
it('new external busy blocks refuse booking and auth failures mark the link', async () => {
  state.busy.primary = [
    { start: iso, end: new Date(+start + 3600000).toISOString() },
  ]
  expect((await call('bookings', input())).status).toBe(409)
  state.authFailure = true
  expect((await call('bookings', input())).status).toBe(502)
  expect(
    (
      await (
        await client.getDb()
      )
        .collection('calendar_links')
        .findOne({ businessId: business._id })
    )?.status,
  ).toBe('needs_reconnect')
})
it('adjacent bookings succeed and lock blocks touch without overlap', async () => {
  expect((await call('bookings', input())).status).toBe(201)
  expect(
    (await call('bookings', input(new Date(+start + 3600000).toISOString())))
      .status,
  ).toBe(201)
  expect(
    await (await client.getDb()).collection('slot_locks').countDocuments(),
  ).toBe(24)
})
it('calendar create failure after locking removes pending booking and locks', async () => {
  const { FakeCalendarProvider } = await import('../calendar/fake')
  const { CalendarAuthError, CalendarError } = await import('../calendar/types')
  for (const error of [new CalendarError(503), new CalendarAuthError()]) {
    const spy = vi
      .spyOn(FakeCalendarProvider.prototype, 'createEvent')
      .mockRejectedValueOnce(error)
    expect((await call('bookings', input())).status).toBe(502)
    spy.mockRestore()
    const db = await client.getDb()
    expect(await db.collection('bookings').countDocuments()).toBe(0)
    expect(await db.collection('slot_locks').countDocuments()).toBe(0)
    expect(
      (
        await db
          .collection('calendar_links')
          .findOne({ businessId: business._id })
      )?.status,
    ).toBe(error instanceof CalendarAuthError ? 'needs_reconnect' : 'ok')
  }
})
it('paused and foreign services are not found; missing schedule has no slots', async () => {
  const db = await client.getDb()
  await db
    .collection('services')
    .updateOne({ _id: service }, { $set: { active: false } })
  expect((await call('bookings', input())).status).toBe(404)
  await db
    .collection('services')
    .updateOne({ _id: service }, { $set: { active: true } })
  await db.collection('schedules').deleteMany({})
  expect((await call('bookings', input())).status).toBe(409)
  expect(
    (await call('bookings', { ...input(), serviceId: String(new ObjectId()) }))
      .status,
  ).toBe(404)
})
it('concurrent abandoned sweeps remove pending attempts and their locks only', async () => {
  const db = await client.getDb()
  const id = new ObjectId()
  await db.collection('bookings').insertOne({
    _id: id,
    businessId: business._id,
    status: 'pending',
    createdAt: new Date(Date.now() - 180000),
  })
  await db
    .collection('slot_locks')
    .insertOne({ businessId: business._id, bookingId: id, block: 123 })
  const { sweepAbandoned } = await import('../bookings/service')
  await Promise.all([sweepAbandoned(), sweepAbandoned()])
  expect(await db.collection('bookings').countDocuments()).toBe(0)
  expect(await db.collection('slot_locks').countDocuments()).toBe(0)
})
it('preflight and invalid keys', async () => {
  const preflight = await handle(
    new Request('http://localhost:3201/api/v1/business', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.test',
        'Access-Control-Request-Headers': 'X-OpenSlots-Key',
      },
    }),
    'business',
  )
  expect(preflight.status).toBe(204)
  expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(
    'https://example.test',
  )
  expect(
    (await call('business', undefined, undefined, { 'X-OpenSlots-Key': 'bad' }))
      .status,
  ).toBe(401)
})
it('20 concurrent reschedules to one target leave one winner and preserve nineteen originals', async () => {
  const { createBooking } = await import('../bookings/service')
  const created = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      createBooking(
        business,
        input(new Date(+start + i * 86400000).toISOString()),
        'http://localhost:3201',
      ),
    ),
  )
  const target = new Date(+start + 25 * 86400000)
  const responses = await Promise.all(
    created.map((b) =>
      call(
        'reschedule',
        { start: target.toISOString() },
        b.manageUrl.split('/').pop(),
      ),
    ),
  )
  const results = await Promise.all(
    responses.map(async (response) =>
      response.status === 200 ? 200 : (await response.json()).error.code,
    ),
  )
  expect(results.filter((s) => s === 200)).toHaveLength(1)
  expect(results.filter((s) => s === 'slot_taken')).toHaveLength(19)
  const db = await client.getDb()
  expect(
    await db.collection('bookings').countDocuments({ start: target }),
  ).toBe(1)
  expect(await db.collection('slot_locks').countDocuments()).toBe(240)
  expect(Object.keys(state.events)).toHaveLength(20)
  expect(state.operations.filter((o) => o.kind === 'update')).toHaveLength(1)
})
it('a different business key cannot manage another booking, and repository reads are scoped', async () => {
  const created = await (await call('bookings', input())).json()
  const token = created.manageUrl.split('/').pop()
  const foreign = {
    ...business,
    _id: new ObjectId(),
    slug: 'foreign',
    publishableKey: 'os_pk_foreignabcdefghijklmnopqrstuv',
  }
  await (await client.getDb()).collection('businesses').insertOne(foreign)
  expect(
    (
      await call('manage', undefined, token, {
        'X-OpenSlots-Key': foreign.publishableKey,
      })
    ).status,
  ).toBe(404)
  expect(
    (
      await call('cancel', {}, token, {
        'X-OpenSlots-Key': foreign.publishableKey,
      })
    ).status,
  ).toBe(404)
  const repo = await import('../bookings/repository')
  expect(
    await repo.getBooking(foreign._id, new ObjectId(created.id)),
  ).toBeNull()
  expect(await repo.listBookings(foreign._id)).toEqual([])
  expect(
    await repo.listBookings(business._id, {
      status: 'confirmed',
      from: start,
      to: new Date(+start + 86400000),
      search: 'CUSTOMER',
    }),
  ).toHaveLength(1)
  expect(await repo.listBookings(business._id, { search: '.*' })).toHaveLength(
    0,
  )
})
it('adjacent occupied intervals with buffers both succeed', async () => {
  await (
    await client.getDb()
  )
    .collection('services')
    .updateOne(
      { _id: service },
      { $set: { bufferBeforeMin: 5, bufferAfterMin: 10 } },
    )
  expect((await call('bookings', input())).status).toBe(201)
  expect(
    (await call('bookings', input(new Date(+start + 75 * 60000).toISOString())))
      .status,
  ).toBe(201)
  expect(
    await (await client.getDb()).collection('slot_locks').countDocuments(),
  ).toBe(30)
})
