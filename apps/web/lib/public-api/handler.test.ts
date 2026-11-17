import { MongoMemoryServer } from 'mongodb-memory-server'
import { ObjectId, Collection } from 'mongodb'
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
    'booking_day_counts',
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
    createdAt: new Date(Date.now() - 240000),
    deadline: new Date(Date.now() - 1000),
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
      { $set: { deadline: new Date(Date.now() - 1) } },
    )
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 240000)
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
  expect(Object.keys(state.events)).toHaveLength(1)
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
    expect(Object.keys(state.events)).toHaveLength(0)
    const deletion = vi
      .spyOn(FakeCalendarProvider.prototype, 'deleteEvent')
      .mockRejectedValueOnce(Error('unreachable'))
    expect((await call('bookings', input())).status).toBe(502)
    deletion.mockRestore()
    const db = await client.getDb()
    expect(
      await db
        .collection('bookings')
        .countDocuments({ status: 'recovery_required' }),
    ).toBe(1)
    expect(await db.collection('slot_locks').countDocuments()).toBe(12)
    await (await import('../bookings/service')).sweepAbandoned()
    expect(await db.collection('slot_locks').countDocuments()).toBe(12)
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
      { $set: { changing: true, changingAt: new Date() } },
    )
  await expect(
    rescheduleBooking(business, id, new Date(+start + 7200000)),
  ).rejects.toMatchObject({ code: 'booking_not_changeable' })
  await db
    .collection('bookings')
    .updateOne(
      { _id: id },
      { $set: { changingAt: new Date(Date.now() - 240000) } },
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
    ).toBe(502)
    const db = await client.getDb()
    expect(await db.collection('slot_locks').countDocuments()).toBe(24)
    expect(
      await db
        .collection('bookings')
        .countDocuments({ status: 'recovery_required' }),
    ).toBe(1)
  } finally {
    patch.mockRestore()
    log.mockRestore()
  }
})
it('sweeps resume claimed cleanup, orphan cleanup and surplus confirmed locks safely', async () => {
  const created = await (await call('bookings', input())).json()
  const db = await client.getDb()
  const abandoned = new ObjectId(),
    orphan = new ObjectId()
  await db
    .collection('bookings')
    .updateOne(
      { _id: new ObjectId(created.id) },
      { $set: { changing: true, changingAt: new Date(0) } },
    )
  const { reserveCapacity, capacityCount } =
    await import('../bookings/capacity')
  await reserveCapacity('stale-date', new ObjectId(created.id), 1)
  await db
    .collection('bookings')
    .insertOne({ _id: abandoned, status: 'abandoned', deadline: new Date(0) })
  await db.collection('slot_locks').insertMany(
    [abandoned, orphan, new ObjectId(created.id)].map((bookingId, i) => ({
      businessId: business._id,
      bookingId,
      block: i,
      createdAt: new Date(0),
    })),
  )
  const { sweepAbandoned } = await import('../bookings/service')
  await Promise.all([sweepAbandoned(), sweepAbandoned()])
  expect(await db.collection('slot_locks').countDocuments()).toBe(12)
  expect(await db.collection('bookings').countDocuments()).toBe(1)
  expect(await capacityCount('stale-date')).toBe(0)
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

it('crash before moving the booking document retains old and new locks', async () => {
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
    expect(await db.collection('slot_locks').countDocuments()).toBe(24)
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
      { $set: { status: 'pending', deadline: new Date(0) } },
    )
  const { sweepAbandoned } = await import('../bookings/service')
  await sweepAbandoned()
  expect(Object.keys(state.events)).toHaveLength(0)
  expect(await db.collection('bookings').countDocuments()).toBe(0)
  expect(await db.collection('slot_locks').countDocuments()).toBe(0)
})
