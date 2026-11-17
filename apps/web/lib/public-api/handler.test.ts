import { MongoMemoryServer } from 'mongodb-memory-server'
import { ObjectId, Collection } from 'mongodb'
import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ after: () => {} }))
vi.mock('../calendar', async () => {
  const { FakeCalendarProvider } = await import('../calendar/fake')
  return {
    ...(await import('../calendar/types')),
    calendarProvider: (a: { id: string }) => new FakeCalendarProvider(a.id),
    eventIdForBooking: (id: string) => id,
  }
})
function activeEvents() {
  return Object.fromEntries(
    Object.entries(state.events).filter(
      ([, value]) => value.event.status !== 'cancelled',
    ),
  )
}
let nextIp = 0
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
      headers: {
        'X-OpenSlots-Key': business.publishableKey,
        'x-forwarded-for': `192.0.2.${++nextIp}`,
        ...headers,
      },
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
  process.env.TRUSTED_PROXY_HOPS = '1'
  const db = await client.getDb()
  for (const name of [
    'bookings',
    'cap_locks',
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
    expect(Object.keys(activeEvents())).toHaveLength(1)
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
  expect(Object.keys(activeEvents())).toHaveLength(0)
  expect(
    await (await client.getDb()).collection('slot_locks').countDocuments(),
  ).toBe(0)
  expect((await call('cancel', {}, token)).status).toBe(200)
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
  for (let i = 0; i < 10; i++)
    await call('bookings', {}, undefined, { 'x-forwarded-for': '198.51.100.1' })
  const limited = await call('bookings', {}, undefined, {
    'x-forwarded-for': '198.51.100.1',
  })
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
    expect(
      await db
        .collection('bookings')
        .countDocuments({ abandoned: { $ne: true } }),
    ).toBe(0)
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
it('concurrent sweeps retain an abandoned tombstone but release its locks', async () => {
  const created = await (await call('bookings', input())).json()
  const db = await client.getDb()
  await db
    .collection('bookings')
    .updateOne(
      { _id: new ObjectId(created.id) },
      { $set: { status: 'pending', expiresAt: new Date(0) } },
    )
  const { sweepAbandoned } = await import('../bookings/service')
  await Promise.all([sweepAbandoned(), sweepAbandoned()])
  expect(
    await db.collection('bookings').countDocuments({ abandoned: true }),
  ).toBe(1)
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
  expect(Object.keys(activeEvents())).toHaveLength(20)
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

it('unknown IP traffic is isolated by key, and proxy hops ignore spoofed prefixes', async () => {
  process.env.TRUSTED_PROXY_HOPS = '0'
  for (let i = 0; i < 60; i++) await call('slots')
  const foreign = {
    ...business,
    _id: new ObjectId(),
    slug: 'other',
    publishableKey: 'os_pk_otherabcdefghijklmnopqrstuvwx',
  }
  await (await client.getDb()).collection('businesses').insertOne(foreign)
  expect(
    (
      await call('slots', undefined, undefined, {
        'X-OpenSlots-Key': foreign.publishableKey,
      })
    ).status,
  ).toBe(400)
  process.env.TRUSTED_PROXY_HOPS = '1'
  for (let i = 0; i < 60; i++)
    await call('slots', undefined, undefined, {
      'x-forwarded-for': `spoof${i}, 198.51.100.2`,
    })
  expect(
    (
      await call('slots', undefined, undefined, {
        'x-forwarded-for': 'new-spoof, 198.51.100.2',
      })
    ).status,
  ).toBe(429)
})
it('invalid stored responses are internal errors and log paths only', async () => {
  await (
    await client.getDb()
  )
    .collection('businesses')
    .updateOne({ _id: business._id }, { $set: { timezone: 'invalid-zone' } })
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const response = await call('business')
    expect(response.status).toBe(500)
    expect((await response.json()).error.code).toBe('internal_error')
    expect(JSON.stringify(log.mock.calls)).not.toContain('invalid-zone')
    expect(JSON.stringify(log.mock.calls)).toContain('timezone')
  } finally {
    log.mockRestore()
  }
})
it('uniform preflight reveals no origin registration and exposes retry headers', async () => {
  for (const origin of ['https://example.test', 'https://unregistered.test']) {
    const response = await handle(
      new Request('http://localhost/api/v1/business', {
        method: 'OPTIONS',
        headers: { Origin: origin },
      }),
      'business',
    )
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Max-Age')).toBe('600')
  }
  const response = await call('business', undefined, undefined, {
    Origin: 'https://example.test',
  })
  expect(response.headers.get('Access-Control-Expose-Headers')).toBe(
    'Retry-After',
  )
  expect(
    (
      await handle(
        new Request('http://localhost/api/v1/business', {
          method: 'PUT',
          headers: { 'X-OpenSlots-Key': business.publishableKey },
        }),
        'business',
      )
    ).status,
  ).toBe(405)
})

it('expired in-flight create never confirms after a second customer wins', async () => {
  const { FakeCalendarProvider } = await import('../calendar/fake')
  const original = FakeCalendarProvider.prototype.createEvent
  let release!: () => void
  let entered!: () => void
  const enteredPromise = new Promise<void>((r) => {
    entered = r
  })
  const gate = new Promise<void>((r) => {
    release = r
  })
  const spy = vi
    .spyOn(FakeCalendarProvider.prototype, 'createEvent')
    .mockImplementationOnce(async function (
      this: import('../calendar/fake').FakeCalendarProvider,
      ...args
    ) {
      entered()
      await gate
      return original.apply(this, args)
    })
  const first = call('bookings', input())
  await enteredPromise
  await (
    await client.getDb()
  )
    .collection('bookings')
    .updateOne(
      { status: 'pending' },
      { $set: { expiresAt: new Date(Date.now() - 1) } },
    )
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 240000)
  await (await import('../bookings/service')).sweepAbandoned()
  const second = await call('bookings', input()).finally(() =>
    clock.mockRestore(),
  )
  release()
  const response = await first
  spy.mockRestore()
  expect(response.status).toBe(409)
  expect(second.status).toBe(201)
  const db = await client.getDb()
  const confirmed = await db
    .collection('bookings')
    .find({ status: 'confirmed' })
    .toArray()
  expect(confirmed).toHaveLength(1)
  expect(Object.keys(activeEvents())).toHaveLength(1)
  expect(
    await db
      .collection('slot_locks')
      .countDocuments({ bookingId: confirmed[0]!._id }),
  ).toBe(12)
  expect(await db.collection('slot_locks').countDocuments()).toBe(12)
})
it('ambiguous create deletes the deterministic event, or retains locks for recovery', async () => {
  const { FakeCalendarProvider } = await import('../calendar/fake')
  const original = FakeCalendarProvider.prototype.createEvent
  const spy = vi
    .spyOn(FakeCalendarProvider.prototype, 'createEvent')
    .mockImplementation(async function (
      this: import('../calendar/fake').FakeCalendarProvider,
      ...args
    ) {
      await original.apply(this, args)
      throw Error('response lost')
    })
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect((await call('bookings', input())).status).toBe(502)
    expect(Object.keys(activeEvents())).toHaveLength(0)
    const deletion = vi
      .spyOn(FakeCalendarProvider.prototype, 'deleteEvent')
      .mockRejectedValueOnce(Error('unreachable'))
    expect((await call('bookings', input())).status).toBe(502)
    deletion.mockRestore()
    const db = await client.getDb()
    expect(
      await db.collection('bookings').countDocuments({ cleanup: true }),
    ).toBe(1)
    expect(await db.collection('slot_locks').countDocuments()).toBe(12)
    await db
      .collection('bookings')
      .updateMany({}, { $set: { syncAt: new Date(0), retryAt: new Date(0) } })
    await (await import('../bookings/service')).sweepAbandoned()
    expect(await db.collection('slot_locks').countDocuments()).toBe(0)
  } finally {
    spy.mockRestore()
    log.mockRestore()
  }
})
it('stale changes recover, fresh claims refuse; admin patches preserve description', async () => {
  const created = await (await call('bookings', input())).json()
  const db = await client.getDb()
  const id = new ObjectId(created.id)
  const { rescheduleBooking } = await import('../bookings/service')
  await db
    .collection('bookings')
    .updateOne(
      { _id: id },
      { $set: { pendingOp: { opId: 'stale', startedAt: new Date() } } },
    )
  await expect(
    rescheduleBooking(business, id, new Date(+start + 7200000)),
  ).rejects.toMatchObject({ code: 'slot_taken' })
  await db.collection('bookings').updateOne(
    { _id: id },
    {
      $set: {
        pendingOp: {
          opId: 'stale',
          startedAt: new Date(Date.now() - 240000),
        },
      },
    },
  )
  const { FakeCalendarProvider } = await import('../calendar/fake')
  const patch = vi.spyOn(FakeCalendarProvider.prototype, 'updateEvent')
  try {
    await rescheduleBooking(business, id, new Date(+start + 7200000))
    expect(patch.mock.calls[0]![2].description).toBeUndefined()
  } finally {
    patch.mockRestore()
  }
})
it('cap is atomic across nonoverlapping times and cancel frees capacity', async () => {
  const db = await client.getDb()
  await db
    .collection('services')
    .updateOne({ _id: service }, { $set: { maxPerDay: 2 } })
  const responses = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      call(
        'bookings',
        input(new Date(+start - 10 * 3600000 + i * 3600000).toISOString()),
      ),
    ),
  )
  const winners = responses.filter((r) => r.status === 201)
  expect(winners).toHaveLength(2)
  const first = await winners[0]!.json()
  expect(
    (await call('cancel', {}, first.manageUrl.split('/').pop())).status,
  ).toBe(200)
  expect((await call('bookings', input(first.start))).status).toBe(201)
})

it('ambiguous patch holds both intervals, and overlapping moves have clear outcome', async () => {
  const created = await (await call('bookings', input())).json()
  const token = created.manageUrl.split('/').pop()
  const overlap = await call(
    'reschedule',
    { start: new Date(+start + 1800000).toISOString() },
    token,
  )
  expect(overlap.status).toBe(409)
  expect((await overlap.json()).error.message).toContain('does not overlap')
  const { FakeCalendarProvider } = await import('../calendar/fake')
  const original = FakeCalendarProvider.prototype.updateEvent
  const patch = vi
    .spyOn(FakeCalendarProvider.prototype, 'updateEvent')
    .mockImplementationOnce(async function (
      this: import('../calendar/fake').FakeCalendarProvider,
      ...args
    ) {
      await original.apply(this, args)
      throw Error('lost response')
    })
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect(
      (
        await call(
          'reschedule',
          { start: new Date(+start + 7200000).toISOString() },
          token,
        )
      ).status,
    ).toBe(200)
    const db = await client.getDb()
    expect(await db.collection('slot_locks').countDocuments()).toBe(24)
    expect(
      await db.collection('bookings').countDocuments({ eventSync: true }),
    ).toBe(1)
  } finally {
    patch.mockRestore()
    log.mockRestore()
  }
})
it('reschedule across service-local dates moves capacity and leaves other services independent', async () => {
  const db = await client.getDb()
  await db
    .collection('services')
    .updateOne({ _id: service }, { $set: { maxPerDay: 1 } })
  const created = await (await call('bookings', input())).json()
  expect(
    (
      await call(
        'reschedule',
        { start: new Date(+start + 86400000).toISOString() },
        created.manageUrl.split('/').pop(),
      )
    ).status,
  ).toBe(200)
  expect((await call('bookings', input())).status).toBe(201)
  expect(
    (
      await call(
        'bookings',
        input(new Date(+start + 86400000 + 7200000).toISOString()),
      )
    ).status,
  ).toBe(409)
  const original = await db.collection('services').findOne({ _id: service })
  const other = new ObjectId()
  await db
    .collection('services')
    .insertOne({ ...original, _id: other, slug: 'other' })
  expect(
    (
      await call('bookings', {
        ...input(new Date(+start + 7200000).toISOString()),
        serviceId: String(other),
      })
    ).status,
  ).toBe(201)
})

it('same-date reschedule does not count its own daily reservation', async () => {
  await (
    await client.getDb()
  )
    .collection('services')
    .updateOne({ _id: service }, { $set: { maxPerDay: 1 } })
  const created = await (await call('bookings', input())).json()
  expect(
    (
      await call(
        'reschedule',
        { start: new Date(+start + 7200000).toISOString() },
        created.manageUrl.split('/').pop(),
      )
    ).status,
  ).toBe(200)
})

it('failure before moving the booking document releases only the new locks', async () => {
  const created = await (await call('bookings', input())).json()
  const original = Collection.prototype.updateOne
  const next = new Date(+start + 7200000)
  const spy = vi
    .spyOn(Collection.prototype, 'updateOne')
    .mockImplementation(async function (this: Collection, ...args) {
      const update = args[1] as { $set?: { start?: Date } }
      if (
        this.collectionName === 'bookings' &&
        update.$set?.start?.getTime() === +next
      )
        throw Error('crash before document move')
      return original.apply(this, args)
    })
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect(
      (
        await call(
          'reschedule',
          { start: next.toISOString() },
          created.manageUrl.split('/').pop(),
        )
      ).status,
    ).toBe(500)
    const db = await client.getDb()
    expect(await db.collection('slot_locks').countDocuments()).toBe(12)
    expect(
      (
        await db
          .collection('bookings')
          .findOne({ _id: new ObjectId(created.id) })
      )?.start,
    ).toEqual(start)
  } finally {
    spy.mockRestore()
    log.mockRestore()
  }
})

it('sweep reconciles a crash after event creation before releasing locks', async () => {
  const created = await (await call('bookings', input())).json()
  const db = await client.getDb()
  await db
    .collection('bookings')
    .updateOne(
      { _id: new ObjectId(created.id) },
      { $set: { status: 'pending', expiresAt: new Date(0) } },
    )
  const { sweepAbandoned } = await import('../bookings/service')
  await sweepAbandoned()
  expect(Object.keys(activeEvents())).toHaveLength(0)
  expect(
    await db.collection('bookings').countDocuments({ abandoned: true }),
  ).toBe(1)
  expect(await db.collection('slot_locks').countDocuments()).toBe(0)
})

it('an exhausted IP cannot consume the shared key allowance', async () => {
  // Use the production defaults: 10 writes per IP and 100 per key.
  const headers = { 'x-forwarded-for': '198.51.100.90' }
  for (let i = 0; i < 110; i++) {
    const response = await call('bookings', {}, undefined, headers)
    expect(response.status).toBe(i < 10 ? 400 : 429)
  }
  expect(
    (
      await call('bookings', input(), undefined, {
        'x-forwarded-for': '198.51.100.91',
      })
    ).status,
  ).toBe(201)
})

function pauseCalendar(kind: 'create' | 'update' | 'delete') {
  let entered!: () => void, release!: () => void
  const ready = new Promise<void>((resolve) => {
    entered = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let used = false
  state.pause = async (operation) => {
    if (operation !== kind || used) return
    used = true
    entered()
    await gate
  }
  return { ready, release }
}
async function sweep() {
  await (await import('../bookings/service')).sweepAbandoned()
}
async function assertInvariants() {
  const db = await client.getDb()
  const confirmed = await db
    .collection<import('../bookings/repository').BookingDoc>('bookings')
    .find({ status: 'confirmed' })
    .toArray()
  const { occupiedInterval, lockBlocks } = await import('@openslots/core')
  for (const b of confirmed) {
    const own = await db
      .collection('slot_locks')
      .find({ bookingId: b._id })
      .toArray()
    const expected = lockBlocks({ start: b.start, ...b.service })
    expect(
      own
        .filter((l) => l.opId === b.opId)
        .map((l) => l.block)
        .sort(),
    ).toEqual(expected.sort())
    const previous =
      b.prevOpId && b.prevStart
        ? lockBlocks({ start: b.prevStart, ...b.service })
        : []
    expect(
      own
        .filter((l) => l.opId === b.prevOpId)
        .map((l) => l.block)
        .sort(),
    ).toEqual(previous.sort())
    expect(own.length).toBe(expected.length + previous.length)
    if (b.capManaged)
      expect(
        await db
          .collection('cap_locks')
          .countDocuments({ bookingId: b._id, opId: b.capOpId }),
      ).toBe(1)
    for (const other of confirmed) {
      if (String(b._id) >= String(other._id)) continue
      const a = occupiedInterval({ start: b.start, ...b.service })
      const c = occupiedInterval({ start: other.start, ...other.service })
      expect(+a.start < +c.end && +c.start < +a.end).toBe(false)
    }
  }
}
async function drain() {
  const db = await client.getDb()
  state.pause = undefined
  state.authFailure = false
  await db
    .collection('calendar_links')
    .updateMany({}, { $set: { status: 'ok' } })
  await db
    .collection('bookings')
    .updateMany({ status: 'pending' }, { $set: { expiresAt: new Date(0) } })
  await db.collection('bookings').updateMany(
    {},
    {
      $set: {
        retryAt: new Date(0),
        syncAt: new Date(0),
        'pendingOp.startedAt': new Date(0),
      },
    },
  )
  for (let i = 0; i < 4; i++) await sweep()
  await db
    .collection('bookings')
    .updateMany(
      { purgeAfter: { $exists: true } },
      { $set: { purgeAfter: new Date(0) } },
    )
  for (const name of ['slot_locks', 'cap_locks'])
    await db
      .collection(name)
      .updateMany({}, { $set: { createdAt: new Date(0) } })
  for (let i = 0; i < 4; i++) await sweep()
  expect(
    await db.collection('bookings').countDocuments({
      $or: [
        { cleanup: true },
        { eventSync: true },
        { pendingOp: { $exists: true } },
        { prevOpId: { $exists: true } },
        { prevCapOpId: { $exists: true } },
        { abandoned: true },
      ],
    }),
  ).toBe(0)
  const confirmed = await db
    .collection('bookings')
    .find({ status: 'confirmed' })
    .toArray()
  expect(Object.keys(activeEvents()).sort()).toEqual(
    confirmed.map((b) => b.googleEventId).sort(),
  )
  for (const b of confirmed) {
    expect(state.events[b.googleEventId]!.event.start.dateTime).toBe(
      b.start.toISOString(),
    )
  }
  for (const name of ['slot_locks', 'cap_locks'])
    for (const lock of await db.collection(name).find({}).toArray()) {
      const b = await db.collection('bookings').findOne({
        _id: lock.bookingId,
        status: { $in: ['pending', 'confirmed'] },
      })
      expect(b).not.toBeNull()
      expect([b!.opId, b!.capOpId]).toContain(lock.opId)
    }
  await assertInvariants()
}

it('cancel commits before a stalled delete and prevents both a move and target reuse race', async () => {
  const created = await (await call('bookings', input())).json()
  const token = created.manageUrl.split('/').pop()
  const gate = pauseCalendar('delete')
  const cancelled = call('cancel', {}, token)
  await gate.ready
  expect(
    (
      await call(
        'reschedule',
        { start: new Date(+start + 7200000).toISOString() },
        token,
      )
    ).status,
  ).toBe(409)
  expect((await call('bookings', input())).status).toBe(409)
  gate.release()
  expect((await cancelled).status).toBe(200)
  expect((await call('bookings', input())).status).toBe(201)
  await drain()
})
it('a patch stalled across cancellation retains time until the cancellation reconciles', async () => {
  const created = await (await call('bookings', input())).json()
  const token = created.manageUrl.split('/').pop()
  const target = new Date(+start + 7200000).toISOString()
  const gate = pauseCalendar('update')
  const moved = call('reschedule', { start: target }, token)
  await gate.ready
  expect((await call('cancel', {}, token)).status).toBe(200)
  expect((await call('bookings', input(target))).status).toBe(409)
  gate.release()
  expect((await moved).status).toBe(409)
  await drain()
})
it('two sweeps cannot reconcile the same revision, even if another Google call would fail', async () => {
  const created = await (await call('bookings', input())).json()
  const db = await client.getDb()
  await db
    .collection('bookings')
    .updateOne({ _id: new ObjectId(created.id) }, { $set: { eventSync: true } })
  const gate = pauseCalendar('update')
  const first = sweep()
  await gate.ready
  state.authFailure = true
  await sweep()
  state.authFailure = false
  gate.release()
  await first
  expect(
    await db.collection('bookings').countDocuments({ eventSync: true }),
  ).toBe(0)
  await drain()
})
it('late creates are deleted again after tombstone cleanup', async () => {
  const gate = pauseCalendar('create')
  const pending = call('bookings', input())
  await gate.ready
  const db = await client.getDb()
  await db
    .collection('bookings')
    .updateMany({}, { $set: { expiresAt: new Date(0) } })
  await sweep()
  expect(Object.keys(activeEvents())).toHaveLength(0)
  gate.release()
  expect((await pending).status).toBe(409)
  // Model a server-side late application after the client's cleanup response.
  const tombstone = await db.collection('bookings').findOne({ abandoned: true })
  state.events[String(tombstone!._id)] = {
    calendarId: 'primary',
    event: {
      summary: 'late',
      start: { dateTime: iso },
      end: { dateTime: new Date(+start + 3600000).toISOString() },
      attendees: [],
    },
  }
  await db
    .collection('bookings')
    .updateMany({}, { $set: { purgeAfter: new Date(0) } })
  await sweep()
  expect(Object.keys(activeEvents())).toHaveLength(0)
  expect(await db.collection('bookings').countDocuments()).toBe(0)
})
it('cap one accepts exactly one new managed booking', async () => {
  const db = await client.getDb()
  await db
    .collection('services')
    .updateOne({ _id: service }, { $set: { maxPerDay: 1 } })
  const results = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      call('bookings', input(new Date(+start + i * 3600000).toISOString())),
    ),
  )
  expect(results.filter((r) => r.status === 201)).toHaveLength(1)
  await drain()
})
it('enabling a cap counts legacy bookings once under four concurrent requests', async () => {
  expect((await call('bookings', input())).status).toBe(201)
  const db = await client.getDb()
  await db
    .collection('services')
    .updateOne({ _id: service }, { $set: { maxPerDay: 2 } })
  const results = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      call(
        'bookings',
        input(new Date(+start + (i + 1) * 3600000).toISOString()),
      ),
    ),
  )
  expect(results.filter((r) => r.status === 201)).toHaveLength(1)
  expect(await db.collection('cap_locks').countDocuments()).toBe(1)
  await drain()
})
it('same-date cap moves preserve the cap operation; cross-date moves replace it', async () => {
  const db = await client.getDb()
  await db
    .collection('services')
    .updateOne({ _id: service }, { $set: { maxPerDay: 1 } })
  const created = await (await call('bookings', input())).json()
  const token = created.manageUrl.split('/').pop()
  const before = await db.collection('cap_locks').findOne({})
  expect(
    (
      await call(
        'reschedule',
        { start: new Date(+start + 7200000).toISOString() },
        token,
      )
    ).status,
  ).toBe(200)
  expect((await db.collection('cap_locks').findOne({}))!.opId).toBe(
    before!.opId,
  )
  expect(
    (
      await call(
        'reschedule',
        { start: new Date(+start + 86400000).toISOString() },
        token,
      )
    ).status,
  ).toBe(200)
  expect((await db.collection('cap_locks').findOne({}))!.opId).not.toBe(
    before!.opId,
  )
  expect(await db.collection('cap_locks').countDocuments()).toBe(1)
  await drain()
})

for (const seed of [17, 903, 4421])
  it(`random state-machine operations preserve invariants (seed ${seed})`, async () => {
    await staleClaimInterleaving()
    let randomState = seed
    const random = (n: number) => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
      return randomState % n
    }
    const db = await client.getDb()
    const secondService = new ObjectId()
    const source = await db.collection('services').findOne({ _id: service })
    await db
      .collection('services')
      .insertOne({ ...source, _id: secondService, slug: 'second' })
    await db.collection('services').updateMany({}, { $set: { maxPerDay: 2 } })
    const tokens: string[] = []
    const { FakeCalendarProvider } = await import('../calendar/fake')
    for (let step = 0; step < 240; step++) {
      await db.collection('api_rate_limits').deleteMany({})
      const operation = random(13)
      const time = new Date(+start + random(7) * 1800000).toISOString()
      const token = tokens[random(Math.max(tokens.length, 1))]
      let spy: ReturnType<typeof vi.spyOn> | undefined
      if (operation === 6)
        spy = vi
          .spyOn(FakeCalendarProvider.prototype, 'updateEvent')
          .mockRejectedValueOnce(Error('injected failure'))
      try {
        if (operation < 3) {
          const response = await call('bookings', {
            ...input(time),
            serviceId: String(random(2) ? service : secondService),
          })
          if (response.status === 201) {
            const b = await response.json()
            tokens.push(b.manageUrl.split('/').pop())
            expect(
              await db.collection('bookings').countDocuments({
                _id: new ObjectId(b.id),
                status: 'confirmed',
              }),
            ).toBe(1)
          }
        } else if (operation === 8) {
          const gate = pauseCalendar('create')
          const pending = call('bookings', input(time))
          const reached = await Promise.race([
            gate.ready.then(() => true),
            pending.then(() => false),
          ])
          if (reached) {
            await db
              .collection('bookings')
              .updateMany(
                { status: 'pending' },
                { $set: { expiresAt: new Date(0) } },
              )
            await sweep()
          }
          gate.release()
          const response = await pending
          state.pause = undefined
          if (response.status === 201)
            tokens.push((await response.json()).manageUrl.split('/').pop())
        } else if (operation === 9 && token) {
          const gate = pauseCalendar('update')
          const moving = call('reschedule', { start: time }, token)
          const reached = await Promise.race([
            gate.ready.then(() => true),
            moving.then(() => false),
          ])
          if (reached) {
            await sweep()
            await call(
              'bookings',
              input(new Date(+start + 6 * 1800000).toISOString()),
            )
            await call('cancel', {}, token)
          }
          gate.release()
          await moving
          state.pause = undefined
        } else if (operation === 10) {
          const cap = random(3)
          await db
            .collection('services')
            .updateOne(
              { _id: service },
              cap
                ? { $set: { maxPerDay: cap } }
                : { $unset: { maxPerDay: '' } },
            )
        } else if (operation === 11) {
          const { CalendarAuthError, CalendarError } =
            await import('../calendar/types')
          const kind = (['createEvent', 'updateEvent', 'deleteEvent'] as const)[
            random(3)
          ]!
          const failure = vi
            .spyOn(FakeCalendarProvider.prototype, kind)
            .mockRejectedValueOnce(
              random(2) ? new CalendarAuthError() : new CalendarError(503),
            )
          try {
            if (kind === 'createEvent') await call('bookings', input(time))
            else if (kind === 'updateEvent' && token)
              await call('reschedule', { start: time }, token)
            else if (token) await call('cancel', {}, token)
            await sweep()
          } finally {
            failure.mockRestore()
            await db
              .collection('calendar_links')
              .updateMany(
                { businessId: business._id, status: 'needs_reconnect' },
                { $set: { status: 'ok' }, $unset: { needsReconnectSince: '' } },
              )
          }
        } else if (operation === 12) {
          await db
            .collection('bookings')
            .updateMany(
              {},
              { $set: { retryAt: new Date(0), syncAt: new Date(0) } },
            )
          await Promise.all([sweep(), sweep()])
        } else if (operation === 3 && token) await call('cancel', {}, token)
        else if ((operation === 4 || operation === 6) && token)
          await call('reschedule', { start: time }, token)
        else if (operation === 7) {
          await db
            .collection('bookings')
            .updateMany(
              { syncAt: { $exists: true } },
              { $set: { syncAt: new Date(0), retryAt: new Date(0) } },
            )
          await db
            .collection('bookings')
            .updateMany(
              { pendingOp: { $exists: true } },
              { $set: { 'pendingOp.startedAt': new Date(0) } },
            )
          await sweep()
        } else await sweep()
        await assertInvariants()
        // Lowering a cap can leave pre-existing usage above it; lock ownership
        // remains checked above, and dedicated admission tests cover the bound.
      } catch (e) {
        throw new Error(`seed ${seed}, step ${step}`, { cause: e })
      } finally {
        spy?.mockRestore()
      }
    }
    await drain()
  }, 30000)

// The hook throws after the Nth successful database write, then refuses every
// subsequent booking write until the simulated process has been replaced.
for (const operation of ['create', 'cancel', 'reschedule'] as const)
  for (
    let crashAt = 1;
    crashAt <= (operation === 'create' ? 4 : operation === 'cancel' ? 5 : 8);
    crashAt++
  )
    it(`crash after write ${crashAt} of ${operation} converges through sweeps`, async () => {
      const db = await client.getDb()
      await db
        .collection('services')
        .updateOne({ _id: service }, { $set: { maxPerDay: 2 } })
      let token: string | undefined
      if (operation !== 'create')
        token = (await (await call('bookings', input())).json()).manageUrl
          .split('/')
          .pop()
      let writes = 0,
        dead = false
      const restores: (() => void)[] = []
      for (const method of [
        'insertOne',
        'insertMany',
        'updateOne',
        'deleteOne',
        'deleteMany',
      ] as const) {
        const original = Collection.prototype[method]
        const spy = vi.spyOn(Collection.prototype, method)
        // MongoDB overloads differ, but all these operations have a promise
        // result and the hook transparently forwards their original arguments.
        spy.mockImplementation(async function (
          this: Collection,
          ...args: unknown[]
        ) {
          if (
            !['bookings', 'slot_locks', 'cap_locks'].includes(
              this.collectionName,
            )
          )
            return Reflect.apply(original, this, args)
          if (dead) throw Error('simulated process stopped')
          const result = await Reflect.apply(original, this, args)
          if (++writes === crashAt) {
            dead = true
            throw Error('injected crash after write')
          }
          return result
        } as never)
        restores.push(() => spy.mockRestore())
      }
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        if (operation === 'create') await call('bookings', input())
        else if (operation === 'cancel') await call('cancel', {}, token)
        else
          await call(
            'reschedule',
            { start: new Date(+start + 86400000).toISOString() },
            token,
          )
      } finally {
        restores.reverse().forEach((restore) => restore())
        log.mockRestore()
      }
      expect(dead).toBe(true)
      await drain()
    })

it('manage reads validate in all persistent and in-flight states', async () => {
  const created = await (await call('bookings', input())).json()
  const token = created.manageUrl.split('/').pop()
  const db = await client.getDb()
  const states = [
    { status: 'pending', expiresAt: new Date(Date.now() + 180000) },
    { status: 'confirmed' },
    {
      status: 'confirmed',
      pendingOp: { opId: 'flight', startedAt: new Date() },
    },
    {
      status: 'confirmed',
      eventSync: true,
      prevOpId: 'previous',
      prevStart: start,
      prevEnd: new Date(+start + 3600000),
    },
    { status: 'cancelled', cleanup: true },
    { status: 'cancelled', cleanup: true, abandoned: true },
    {
      status: 'cancelled',
      abandoned: true,
      purgeAfter: new Date(Date.now() + 3600000),
    },
  ]
  for (const fields of states) {
    await db
      .collection('bookings')
      .updateOne({ _id: new ObjectId(created.id) }, { $set: fields })
    const response = await call('manage', undefined, token)
    expect(response.status).toBe(fields.abandoned ? 404 : 200)
  }
})

it('bounded orphan passes advance beyond retained current locks', async () => {
  const db = await client.getDb()
  for (let i = 0; i < 5; i++)
    expect(
      (
        await call(
          'bookings',
          input(new Date(+start + i * 3600000).toISOString()),
        )
      ).status,
    ).toBe(201)
  await db
    .collection('slot_locks')
    .updateMany({}, { $set: { createdAt: new Date(0) } })
  const orphan = new ObjectId()
  await db.collection('slot_locks').insertOne({
    businessId: business._id,
    bookingId: orphan,
    block: 1,
    opId: 'orphan',
    createdAt: new Date(0),
  })
  for (let i = 0; i < 5; i++) await sweep()
  expect(
    await db.collection('slot_locks').countDocuments({ bookingId: orphan }),
  ).toBe(0)
  await assertInvariants()
})

it('a managed booking cannot move dates while its service cap is removed', async () => {
  const db = await client.getDb()
  await db
    .collection('services')
    .updateOne({ _id: service }, { $set: { maxPerDay: 1 } })
  const created = await (await call('bookings', input())).json()
  await db
    .collection('services')
    .updateOne({ _id: service }, { $unset: { maxPerDay: '' } })
  expect(
    (
      await call(
        'reschedule',
        { start: new Date(+start + 86400000).toISOString() },
        created.manageUrl.split('/').pop(),
      )
    ).status,
  ).toBe(409)
  await assertInvariants()
})

for (const removed of [false, true])
  it(`cap locks outside restored/lowered range count (removed=${removed})`, async () => {
    const db = await client.getDb()
    const { reserveCapacity } = await import('../bookings/capacity')
    const { bookings } = await import('../bookings/repository')
    const created = await (await call('bookings', input())).json()
    const b = (await (
      await bookings()
    ).findOne({ _id: new ObjectId(created.id) }))!
    const date = iso.slice(0, 10)
    await db.collection('cap_locks').insertOne({
      businessId: business._id,
      bookingId: b._id,
      opId: 'old',
      capKey: `${service}|${date}|2`,
      createdAt: new Date(),
    })
    if (removed)
      await db
        .collection('services')
        .updateOne({ _id: service }, { $unset: { maxPerDay: '' } })
    await db
      .collection('services')
      .updateOne({ _id: service }, { $set: { maxPerDay: 2 } })
    const results = await Promise.allSettled(
      ['a', 'b'].map((op) => reserveCapacity(b, op, start, 'UTC', 2)),
    )
    expect(
      results.filter((r) => r.status === 'fulfilled').length,
    ).toBeLessThanOrEqual(1)
    expect(
      await db.collection('cap_locks').countDocuments(),
    ).toBeLessThanOrEqual(2)
  })
it('fifty failed tenants do not starve later cleanup', async () => {
  const db = await client.getDb()
  const created = await (await call('bookings', input())).json()
  const original = await db
    .collection('bookings')
    .findOne({ _id: new ObjectId(created.id) })
  await db.collection('bookings').insertMany(
    Array.from({ length: 50 }, (_, i) => ({
      ...original,
      _id: new ObjectId(),
      businessId: new ObjectId(),
      manageTokenHash: `stuck${i}`,
      cleanup: true,
      status: 'cancelled',
      syncAt: new Date(0),
    })),
  )
  // Insert the healthy tenant last, so natural collection order cannot
  // accidentally make an unfiltered sweep appear fair.
  await db.collection('bookings').deleteOne({ _id: original!._id })
  await db.collection('bookings').insertOne({
    ...original!,
    status: 'cancelled',
    cleanup: true,
  })
  await sweep()
  await sweep()
  expect(
    await db
      .collection('slot_locks')
      .countDocuments({ bookingId: original!._id }),
  ).toBe(0)
  expect(
    await db
      .collection('bookings')
      .countDocuments({ retryAt: { $gt: new Date() } }),
  ).toBe(50)
})

for (const field of ['eventSync', 'prevOpId', 'prevCapOpId'])
  it(`refuses a second move with ${field} still set`, async () => {
    const db = await client.getDb()
    const created = await (await call('bookings', input())).json()
    await db
      .collection('bookings')
      .updateOne(
        { _id: new ObjectId(created.id) },
        { $set: { [field]: field === 'eventSync' ? true : 'previous' } },
      )
    expect(
      (
        await call(
          'reschedule',
          { start: new Date(+start + 86400000).toISOString() },
          created.manageUrl.split('/').pop(),
        )
      ).status,
    ).toBe(409)
  })
it('late confirmation never confirms an expired pending attempt', async () => {
  const gate = pauseCalendar('create')
  const pending = call('bookings', input())
  await gate.ready
  const db = await client.getDb()
  await db
    .collection('bookings')
    .updateMany({}, { $set: { expiresAt: new Date(0) } })
  gate.release()
  expect((await pending).status).toBe(409)
  expect(
    await db.collection('bookings').countDocuments({ status: 'confirmed' }),
  ).toBe(0)
})
it('an acknowledged-on-server move retains locks and returns success', async () => {
  const created = await (await call('bookings', input())).json()
  const original = Collection.prototype.updateOne
  const spy = vi
    .spyOn(Collection.prototype, 'updateOne')
    .mockImplementation(async function (this: Collection, ...args: unknown[]) {
      const result = await Reflect.apply(original, this, args)
      if (
        this.collectionName === 'bookings' &&
        (args[1] as { $set?: { eventSync?: boolean } }).$set?.eventSync
      )
        throw Error('lost acknowledgement')
      return result
    } as never)
  try {
    expect(
      (
        await call(
          'reschedule',
          { start: new Date(+start + 86400000).toISOString() },
          created.manageUrl.split('/').pop(),
        )
      ).status,
    ).toBe(200)
    await assertInvariants()
  } finally {
    spy.mockRestore()
  }
})
it('availability uses bounded current and previous range index scans', async () => {
  const db = await client.getDb()
  const created = await (await call('bookings', input())).json()
  const source = await db
    .collection('bookings')
    .findOne({ _id: new ObjectId(created.id) })
  await db.collection('bookings').insertMany(
    Array.from({ length: 2000 }, (_, i) => ({
      ...source,
      _id: new ObjectId(),
      manageTokenHash: `past${i}`,
      start: new Date(0),
      end: new Date(3600000),
      prevStart: new Date(0),
      prevEnd: new Date(3600000),
    })),
  )
  let examined: number | undefined
  const original = Collection.prototype.find
  const spy = vi
    .spyOn(Collection.prototype, 'find')
    .mockImplementation(function (this: Collection, ...args: unknown[]) {
      const cursor = Reflect.apply(original, this, args)
      if (
        this.collectionName === 'bookings' &&
        ((args[0] as { $or?: unknown }).$or ||
          (args[0] as { capManaged?: unknown }).capManaged)
      ) {
        const toArray = cursor.toArray.bind(cursor)
        cursor.toArray = async () => {
          const plan = await Reflect.apply(original, this, args).explain(
            'executionStats',
          )
          examined = plan.executionStats.totalDocsExamined
          return toArray()
        }
      }
      return cursor
    } as never)
  try {
    await call('slots', undefined, undefined, {})
    // Directly invoke the shared availability path with a valid date range.
    await (
      await import('../bookings/service')
    ).availableSlots(
      business,
      String(service),
      { from: iso.slice(0, 10), to: iso.slice(0, 10) },
      'UTC',
    )
    expect(examined).toBeDefined()
    expect(examined).toBeLessThan(10)
    examined = undefined
    await (
      await import('../bookings/capacity')
    ).reserveCapacity(
      source as unknown as import('../bookings/repository').BookingDoc,
      'explain-cap',
      start,
      'UTC',
      2,
    )
    expect(examined).toBeDefined()
    expect(examined).toBeLessThan(10)
  } finally {
    spy.mockRestore()
  }
})

async function staleClaimInterleaving() {
  const db = await client.getDb()
  const created = await (await call('bookings', input())).json()
  const id = new ObjectId(created.id)
  await db
    .collection('bookings')
    .updateOne(
      { _id: id },
      { $set: { pendingOp: { opId: 'stale', startedAt: new Date(0) } } },
    )
  let clearReady!: () => void, clearResume!: () => void
  const ready = new Promise<void>((r) => {
    clearReady = r
  })
  const paused = new Promise<void>((r) => {
    clearResume = r
  })
  const original = Collection.prototype.updateOne
  let held = false
  const spy = vi
    .spyOn(Collection.prototype, 'updateOne')
    .mockImplementation(async function (this: Collection, ...args: unknown[]) {
      if (
        !held &&
        this.collectionName === 'bookings' &&
        (args[1] as { $unset?: { pendingOp?: string } }).$unset?.pendingOp ===
          '' &&
        !(args[1] as { $set?: { start?: Date } }).$set?.start
      ) {
        held = true
        clearReady()
        await paused
      }
      return Reflect.apply(original, this, args)
    } as never)
  let locksReady!: () => void, locksResume!: () => void
  const lr = new Promise<void>((r) => {
    locksReady = r
  })
  const lp = new Promise<void>((r) => {
    locksResume = r
  })
  const insert = Collection.prototype.insertMany
  const insertSpy = vi
    .spyOn(Collection.prototype, 'insertMany')
    .mockImplementation(async function (this: Collection, ...args: unknown[]) {
      const result = await Reflect.apply(insert, this, args)
      if (this.collectionName === 'slot_locks') {
        locksReady()
        await lp
      }
      return result
    } as never)
  try {
    const sweeping = sweep()
    await ready
    const moving = call(
      'reschedule',
      { start: new Date(+start + 86400000).toISOString() },
      created.manageUrl.split('/').pop(),
    )
    await lr
    const before = await db.collection('bookings').findOne({ _id: id })
    clearResume()
    await sweeping
    expect(
      (await db.collection('bookings').findOne({ _id: id }))!.pendingOp,
    ).toEqual(before!.pendingOp)
    locksResume()
    expect((await moving).status).toBe(200)
    await assertInvariants()
  } finally {
    clearResume()
    locksResume()
    spy.mockRestore()
    insertSpy.mockRestore()
  }
}
it(
  'stale pendingOp cleanup cannot clear the claim of a newer stalled move',
  staleClaimInterleaving,
)

it('a create inserting locks after expiry cleanup releases its own late locks', async () => {
  const db = await client.getDb()
  let ready!: () => void, resume!: () => void
  const reached = new Promise<void>((r) => {
      ready = r
    }),
    wait = new Promise<void>((r) => {
      resume = r
    })
  const original = Collection.prototype.insertMany
  const spy = vi
    .spyOn(Collection.prototype, 'insertMany')
    .mockImplementation(async function (this: Collection, ...args: unknown[]) {
      if (this.collectionName === 'slot_locks') {
        ready()
        await wait
      }
      return Reflect.apply(original, this, args)
    } as never)
  try {
    const pending = call('bookings', input())
    await reached
    await db
      .collection('bookings')
      .updateMany({}, { $set: { expiresAt: new Date(0) } })
    await sweep()
    resume()
    expect((await pending).status).toBe(409)
    expect(await db.collection('slot_locks').countDocuments()).toBe(0)
  } finally {
    resume()
    spy.mockRestore()
  }
})
it('cancel retries a revision bumped by a concurrent lease', async () => {
  const created = await (await call('bookings', input())).json()
  const original = Collection.prototype.updateOne
  let bumped = false
  const spy = vi
    .spyOn(Collection.prototype, 'updateOne')
    .mockImplementation(async function (this: Collection, ...args: unknown[]) {
      if (
        !bumped &&
        this.collectionName === 'bookings' &&
        (args[1] as { $set?: { status?: string } }).$set?.status === 'cancelled'
      ) {
        bumped = true
        await Reflect.apply(original, this, [
          { _id: new ObjectId(created.id) },
          { $inc: { rev: 1 }, $set: { syncAt: new Date() } },
        ])
      }
      return Reflect.apply(original, this, args)
    } as never)
  try {
    expect(
      (await call('cancel', {}, created.manageUrl.split('/').pop())).status,
    ).toBe(200)
  } finally {
    spy.mockRestore()
  }
})
it('ended bookings are marked after releasing both lock collections', async () => {
  const db = await client.getDb()
  const created = await (await call('bookings', input())).json()
  await db
    .collection('bookings')
    .updateOne(
      { _id: new ObjectId(created.id) },
      { $set: { end: new Date(0) } },
    )
  await sweep()
  expect(
    (await db
      .collection('bookings')
      .findOne({ _id: new ObjectId(created.id) }))!.locksReleased,
  ).toBe(true)
  expect(await db.collection('slot_locks').countDocuments()).toBe(0)
})

it('a move stalled after locks loses after its expired claim is swept and another customer books', async () => {
  const db = await client.getDb()
  const created = await (await call('bookings', input())).json()
  const id = new ObjectId(created.id),
    target = new Date(+start + 86400000).toISOString()
  let ready!: () => void, resume!: () => void
  const reached = new Promise<void>((r) => {
      ready = r
    }),
    wait = new Promise<void>((r) => {
      resume = r
    })
  const original = Collection.prototype.insertMany
  let held = false
  const spy = vi
    .spyOn(Collection.prototype, 'insertMany')
    .mockImplementation(async function (this: Collection, ...args: unknown[]) {
      const result = await Reflect.apply(original, this, args)
      if (!held && this.collectionName === 'slot_locks') {
        held = true
        ready()
        await wait
      }
      return result
    } as never)
  try {
    const moving = call(
      'reschedule',
      { start: target },
      created.manageUrl.split('/').pop(),
    )
    await reached
    await db
      .collection('bookings')
      .updateOne({ _id: id }, { $set: { 'pendingOp.startedAt': new Date(0) } })
    await db
      .collection('slot_locks')
      .updateMany({ bookingId: id }, { $set: { createdAt: new Date(0) } })
    await sweep()
    const other = await call('bookings', input(target))
    expect(other.status).toBe(201)
    resume()
    expect((await moving).status).toBe(409)
    await assertInvariants()
  } finally {
    resume()
    spy.mockRestore()
  }
})
it('create refuses Google when the expiry reserve has been consumed before acquisition finishes', async () => {
  let clock: ReturnType<typeof vi.spyOn> | undefined
  const original = Collection.prototype.insertMany
  const spy = vi
    .spyOn(Collection.prototype, 'insertMany')
    .mockImplementation(async function (this: Collection, ...args: unknown[]) {
      const result = await Reflect.apply(original, this, args)
      if (this.collectionName === 'slot_locks')
        clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 130000)
      return result
    } as never)
  try {
    expect((await call('bookings', input())).status).toBe(502)
    expect(state.operations.filter((o) => o.kind === 'create')).toHaveLength(0)
  } finally {
    clock?.mockRestore()
    spy.mockRestore()
  }
})

it('reconcile restores a deleted Google tombstone with confirmed status', async () => {
  const created = await (await call('bookings', input())).json()
  const { FakeCalendarProvider } = await import('../calendar/fake')
  await new FakeCalendarProvider(String(account)).deleteEvent(
    'primary',
    created.id,
  )
  expect(state.events[created.id]!.event.status).toBe('cancelled')
  expect(
    (
      await call(
        'reschedule',
        { start: new Date(+start + 86400000).toISOString() },
        created.manageUrl.split('/').pop(),
      )
    ).status,
  ).toBe(200)
  expect(state.events[created.id]!.event.status).toBe('confirmed')
  expect(state.events[created.id]!.event.start.dateTime).toBe(
    new Date(+start + 86400000).toISOString(),
  )
})
it('an unpatchable 410 keeps sync intent and backs off instead of freeing previous locks', async () => {
  const db = await client.getDb()
  const created = await (await call('bookings', input())).json()
  const { FakeCalendarProvider } = await import('../calendar/fake')
  const { CalendarError } = await import('../calendar/types')
  const spy = vi
    .spyOn(FakeCalendarProvider.prototype, 'updateEvent')
    .mockRejectedValue(new CalendarError(410))
  try {
    expect(
      (
        await call(
          'reschedule',
          { start: new Date(+start + 86400000).toISOString() },
          created.manageUrl.split('/').pop(),
        )
      ).status,
    ).toBe(200)
    const b = await db
      .collection('bookings')
      .findOne({ _id: new ObjectId(created.id) })
    expect(b!.eventSync).toBe(true)
    expect(+b!.retryAt).toBeGreaterThan(Date.now())
    expect(
      await db.collection('slot_locks').countDocuments({ opId: b!.prevOpId }),
    ).toBe(12)
    expect(spy).toHaveBeenCalledTimes(2)
    await sweep()
    expect(spy).toHaveBeenCalledTimes(2)
  } finally {
    spy.mockRestore()
  }
})
it('purge work backs off missing businesses and rotates to live tenants', async () => {
  const db = await client.getDb()
  const created = await (await call('bookings', input())).json()
  const source = await db
    .collection('bookings')
    .findOne({ _id: new ObjectId(created.id) })
  await db.collection('bookings').insertMany(
    Array.from({ length: 50 }, (_, i) => ({
      ...source,
      _id: new ObjectId(),
      businessId: new ObjectId(),
      manageTokenHash: `purge${i}`,
      status: 'cancelled',
      purgeAfter: new Date(0),
      syncAt: new Date(0),
    })),
  )
  await db
    .collection('bookings')
    .updateOne(
      { _id: source!._id },
      { $set: { status: 'cancelled', purgeAfter: new Date(0) } },
    )
  await sweep()
  await sweep()
  expect(
    (await db.collection('bookings').findOne({ _id: source!._id }))!.purgeAfter,
  ).toBeUndefined()
  expect(
    await db
      .collection('bookings')
      .countDocuments({ retryAt: { $gt: new Date() } }),
  ).toBe(50)
})

it('confirmation applied late before abandonment loses keeps its event and locks', async () => {
  const original = Collection.prototype.updateOne
  let late: unknown[] | undefined
  const spy = vi
    .spyOn(Collection.prototype, 'updateOne')
    .mockImplementation(async function (this: Collection, ...args: unknown[]) {
      const set = (
        args[1] as { $set?: { status?: string; abandoned?: boolean } }
      ).$set
      if (this.collectionName === 'bookings' && set?.status === 'confirmed') {
        late = args
        throw Error(
          'confirmation acknowledgement lost before server application',
        )
      }
      if (this.collectionName === 'bookings' && set?.abandoned && late) {
        await Reflect.apply(original, this, late)
        late = undefined
      }
      return Reflect.apply(original, this, args)
    } as never)
  try {
    expect((await call('bookings', input())).status).toBe(201)
    expect(Object.keys(activeEvents())).toHaveLength(1)
    expect(
      await (await client.getDb()).collection('slot_locks').countDocuments(),
    ).toBe(12)
  } finally {
    spy.mockRestore()
  }
})

it('a move applied after the first recovery read keeps its new locks', async () => {
  const created = await (await call('bookings', input())).json()
  const original = Collection.prototype.updateOne
  let late: unknown[] | undefined
  const spy = vi
    .spyOn(Collection.prototype, 'updateOne')
    .mockImplementation(async function (this: Collection, ...args: unknown[]) {
      const write = args[1] as {
        $set?: { eventSync?: boolean }
        $unset?: { pendingOp?: string }
      }
      if (this.collectionName === 'bookings' && write.$set?.eventSync) {
        late = args
        throw Error('move applied late')
      }
      if (
        this.collectionName === 'bookings' &&
        write.$unset?.pendingOp === '' &&
        late
      ) {
        await Reflect.apply(original, this, late)
        late = undefined
      }
      return Reflect.apply(original, this, args)
    } as never)
  try {
    expect(
      (
        await call(
          'reschedule',
          { start: new Date(+start + 86400000).toISOString() },
          created.manageUrl.split('/').pop(),
        )
      ).status,
    ).toBe(200)
    await assertInvariants()
  } finally {
    spy.mockRestore()
  }
})

it('keeps the cap lock and event of a booking whose confirm reply was lost and which was then moved', async () => {
  // The confirm write is applied but its reply is lost, the customer moves
  // the booking with the manage link from the invitation, and the create
  // request's recovery read fails. The create path must not treat the moved
  // booking (now under another operation id) as a dead attempt.
  const db = await client.getDb()
  await db
    .collection('services')
    .updateOne({ _id: service }, { $set: { maxPerDay: 3 } })
  const originalUpdate = Collection.prototype.updateOne
  const originalFind = Collection.prototype.findOne
  let held = false
  let failNextRead = false
  vi.spyOn(Collection.prototype, 'findOne').mockImplementation(async function (
    this: Collection,
    ...args: unknown[]
  ) {
    if (failNextRead && this.collectionName === 'bookings') {
      failNextRead = false
      throw Error('read lost')
    }
    return Reflect.apply(originalFind, this, args)
  } as never)
  vi.spyOn(Collection.prototype, 'updateOne').mockImplementation(
    async function (this: Collection, ...args: unknown[]) {
      const set = (args[1] as { $set?: { status?: string } }).$set
      if (
        !held &&
        this.collectionName === 'bookings' &&
        set?.status === 'confirmed'
      ) {
        held = true
        await Reflect.apply(originalUpdate, this, args)
        const invitation = Object.values(state.events)[0]!.event
        const token = invitation.description!.split('/m/').pop()!
        const moved = await call(
          'reschedule',
          { start: new Date(+start + 3 * 3600000).toISOString() },
          token,
        )
        expect(moved.status).toBe(200)
        failNextRead = true
        throw Error('reply lost')
      }
      return Reflect.apply(originalUpdate, this, args)
    } as never,
  )
  const response = await call('bookings', input())
  vi.restoreAllMocks()

  expect(response.status).toBe(201)
  const booking = (await db.collection('bookings').findOne({}))!
  expect(booking.status).toBe('confirmed')
  expect(
    await db.collection('cap_locks').countDocuments({ opId: booking.capOpId }),
  ).toBe(1)
  expect(
    await db.collection('slot_locks').countDocuments({ opId: booking.opId }),
  ).toBe(12)
  expect(Object.keys(activeEvents())).toHaveLength(1)
})

it('does not recreate a missing event after the confirmed revision was cancelled', async () => {
  const created = await (await call('bookings', input())).json()
  const db = await client.getDb()
  const id = new ObjectId(created.id)
  await db
    .collection('bookings')
    .updateOne({ _id: id }, { $set: { eventSync: true } })
  const { FakeCalendarProvider } = await import('../calendar/fake')
  const { CalendarError } = await import('../calendar/types')
  const create = vi.spyOn(FakeCalendarProvider.prototype, 'createEvent')
  const update = vi
    .spyOn(FakeCalendarProvider.prototype, 'updateEvent')
    .mockImplementationOnce(async () => {
      await db
        .collection('bookings')
        .updateOne(
          { _id: id },
          { $set: { status: 'cancelled', cleanup: true }, $inc: { rev: 1 } },
        )
      throw new CalendarError(404)
    })
  try {
    await (await import('../bookings/service')).reconcile(id)
    expect(update).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
    expect(
      (await db.collection('bookings').findOne({ _id: id }))!.cleanup,
    ).toBe(true)
  } finally {
    create.mockRestore()
    update.mockRestore()
  }
})

it('reconcile supplies its bounded deadline to delete, patch, recreation and restore', async () => {
  const created = await (await call('bookings', input())).json()
  const db = await client.getDb()
  const id = new ObjectId(created.id)
  const { FakeCalendarProvider } = await import('../calendar/fake')
  const { CalendarError } = await import('../calendar/types')
  const update = vi
    .spyOn(FakeCalendarProvider.prototype, 'updateEvent')
    .mockRejectedValueOnce(new CalendarError(404))
  const create = vi.spyOn(FakeCalendarProvider.prototype, 'createEvent')
  const remove = vi.spyOn(FakeCalendarProvider.prototype, 'deleteEvent')
  const before = Date.now()
  try {
    await db
      .collection('bookings')
      .updateOne({ _id: id }, { $set: { eventSync: true } })
    await (await import('../bookings/service')).reconcile(id)
    expect(update).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenCalledOnce()
    await call('cancel', {}, created.manageUrl.split('/').pop())
    expect(remove).toHaveBeenCalledOnce()
    for (const deadline of [
      update.mock.calls[0]![3],
      update.mock.calls[1]![3],
      create.mock.calls[0]![2],
      remove.mock.calls[0]![2],
    ]) {
      expect(deadline).toBeGreaterThanOrEqual(before + 150000)
      expect(deadline).toBeLessThanOrEqual(Date.now() + 150000)
    }
  } finally {
    update.mockRestore()
    create.mockRestore()
    remove.mockRestore()
  }
})
