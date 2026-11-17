import { computeSlots, scheduleRulesSchema } from '@openslots/core'
import { ObjectId } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

type Repo = typeof import('./repository')
type BusinessRepo = typeof import('../businesses/repository')
type Client = typeof import('../mongo-client')

let mongo: MongoMemoryServer
let repo: Repo
let businesses: BusinessRepo
let client: Client

const salon = () => ({
  name: 'Salon hours',
  timezone: 'America/Denver',
  weekly: [
    [],
    [],
    [{ startMin: 540, endMin: 1080 }],
    [{ startMin: 540, endMin: 1080 }],
    [
      { startMin: 540, endMin: 750 },
      { startMin: 810, endMin: 1200 },
    ],
    [{ startMin: 540, endMin: 1080 }],
    [{ startMin: 600, endMin: 900 }],
  ],
  overrides: [
    { date: '2026-12-24', ranges: [{ startMin: 540, endMin: 780 }] },
    { date: '2026-12-25', ranges: [] },
    { date: '2026-12-28', ranges: [{ startMin: 600, endMin: 960 }] },
  ],
})

async function makeBusiness(userId: string, slug: string) {
  const created = await businesses.createBusiness(userId, {
    name: slug,
    slug,
    timezone: 'Europe/London',
  })
  if (!created.ok) throw new Error('expected ok')
  return created.business._id
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  client = await import('../mongo-client')
  repo = await import('./repository')
  businesses = await import('../businesses/repository')
}, 120_000)

afterAll(async () => {
  await client.closeMongoClient()
  await mongo.stop()
})

beforeEach(async () => {
  const db = await client.getDb()
  for (const name of ['businesses', 'schedules', 'services'])
    await db.collection(name).deleteMany({})
})

describe('schedules repository: business scoping', () => {
  it('cannot read, list, update or delete another business’s schedule', async () => {
    const a = await makeBusiness('alice', 'alice-biz')
    const b = await makeBusiness('bob', 'bob-biz')
    const made = await repo.createSchedule(a, salon())
    if (!made.ok) throw new Error('expected ok')
    const id = made.schedule._id.toHexString()

    expect(await repo.getSchedule(b, id)).toBeNull()
    expect(await repo.getSchedule(a, id)).not.toBeNull()
    expect((await repo.listSchedules(b)).map((s) => s.name)).toEqual([
      'Working hours',
    ])
    expect(await repo.listSchedules(a)).toHaveLength(2)

    const hijack = await repo.updateSchedule(b, id, {
      ...salon(),
      name: 'Hijacked',
    })
    expect(hijack).toEqual({ ok: false, error: 'not_found' })
    expect((await repo.getSchedule(a, id))?.name).toBe('Salon hours')

    // Bob has two schedules after this, so only ownership can stop him.
    await repo.createSchedule(b, salon())
    expect(await repo.deleteSchedule(b, id)).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(await repo.getSchedule(a, id)).not.toBeNull()
  })

  it('treats malformed ids as not found', async () => {
    const a = await makeBusiness('alice', 'alice-biz')
    expect(await repo.getSchedule(a, 'nope')).toBeNull()
    expect(await repo.updateSchedule(a, '{"$ne":1}', salon())).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(await repo.deleteSchedule(a, new ObjectId().toHexString())).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})

describe('schedules repository: writes', () => {
  it('creates, updates and reads back the engine’s shape', async () => {
    const biz = await makeBusiness('alice', 'alice-biz')
    const made = await repo.createSchedule(biz, salon())
    if (!made.ok) throw new Error('expected ok')
    const id = made.schedule._id.toHexString()

    const updated = await repo.updateSchedule(biz, id, {
      ...salon(),
      name: 'Late nights',
      timezone: 'Europe/London',
    })
    expect(updated.ok).toBe(true)
    const got = await repo.getSchedule(biz, id)
    expect(got?.name).toBe('Late nights')
    expect(got?.timezone).toBe('Europe/London')
    expect(got?.businessId.equals(biz)).toBe(true)
    expect(got?.weekly).toHaveLength(7)
  })

  it('refuses invalid hours on the server, and stores nothing', async () => {
    const biz = await makeBusiness('alice', 'alice-biz')
    const made = await repo.createSchedule(biz, salon())
    if (!made.ok) throw new Error('expected ok')
    const id = made.schedule._id.toHexString()
    const good = salon()

    const bad = (patch: Partial<ReturnType<typeof salon>>) =>
      repo.updateSchedule(biz, id, { ...good, ...patch })

    const endBeforeStart = await bad({
      weekly: good.weekly.map((d, i) =>
        i === 1 ? [{ startMin: 1020, endMin: 540 }] : d,
      ),
    })
    expect(endBeforeStart).toMatchObject({ ok: false, error: 'invalid' })
    if (!endBeforeStart.ok && endBeforeStart.error === 'invalid')
      expect(endBeforeStart.errors['weekly.1.0.endMin']).toBeDefined()

    const overlap = await bad({
      weekly: good.weekly.map((d, i) =>
        i === 1
          ? [
              { startMin: 540, endMin: 780 },
              { startMin: 720, endMin: 1020 },
            ]
          : d,
      ),
    })
    expect(overlap).toMatchObject({ ok: false, error: 'invalid' })

    expect(
      await bad({
        weekly: good.weekly.map((d, i) =>
          i === 2 ? [{ startMin: 543, endMin: 1020 }] : d,
        ),
      }),
    ).toMatchObject({ ok: false, error: 'invalid' })
    expect(await bad({ weekly: good.weekly.slice(0, 6) })).toMatchObject({
      ok: false,
      error: 'invalid',
    })
    expect(await bad({ timezone: 'Mars/Olympus' })).toMatchObject({
      ok: false,
      error: 'invalid',
    })
    expect(await bad({ name: '   ' })).toMatchObject({
      ok: false,
      error: 'invalid',
    })
    expect(
      await bad({
        overrides: [
          { date: '2026-12-25', ranges: [] },
          { date: '2026-12-25', ranges: [] },
        ],
      }),
    ).toMatchObject({ ok: false, error: 'invalid' })
    expect(
      await bad({ overrides: [{ date: '2026-02-30', ranges: [] }] }),
    ).toMatchObject({ ok: false, error: 'invalid' })
    expect(await repo.createSchedule(biz, { name: 'x' })).toMatchObject({
      ok: false,
      error: 'invalid',
    })

    // Unchanged after all the refusals.
    const got = await repo.getSchedule(biz, id)
    expect(got?.weekly).toEqual(good.weekly)
    expect(got?.overrides).toEqual(good.overrides)
  })
})

describe('schedules repository: delete rules', () => {
  it('keeps the last schedule of a business', async () => {
    const biz = await makeBusiness('alice', 'alice-biz')
    const [only] = await repo.listSchedules(biz)
    expect(await repo.deleteSchedule(biz, only!._id.toHexString())).toEqual({
      ok: false,
      error: 'last_schedule',
    })
    expect(await repo.listSchedules(biz)).toHaveLength(1)
  })

  it('deletes a schedule when another remains', async () => {
    const biz = await makeBusiness('alice', 'alice-biz')
    const made = await repo.createSchedule(biz, salon())
    if (!made.ok) throw new Error('expected ok')
    expect(
      await repo.deleteSchedule(biz, made.schedule._id.toHexString()),
    ).toEqual({ ok: true })
    expect(await repo.listSchedules(biz)).toHaveLength(1)
  })

  it('refuses to delete a schedule a service uses (ObjectId or string reference)', async () => {
    const biz = await makeBusiness('alice', 'alice-biz')
    const made = await repo.createSchedule(biz, salon())
    if (!made.ok) throw new Error('expected ok')
    const id = made.schedule._id
    const services = (await client.getDb()).collection('services')

    await services.insertOne({
      businessId: biz,
      name: 'Cut and style',
      scheduleId: id,
    })
    expect(await repo.deleteSchedule(biz, id.toHexString())).toEqual({
      ok: false,
      error: 'in_use',
      serviceNames: ['Cut and style'],
    })

    await services.deleteMany({})
    await services.insertOne({
      businessId: biz,
      name: 'Trim',
      scheduleId: id.toHexString(),
    })
    expect(await repo.deleteSchedule(biz, id.toHexString())).toMatchObject({
      ok: false,
      error: 'in_use',
    })

    // A service of another business with the same id is not this business's.
    await services.deleteMany({})
    await services.insertOne({
      businessId: new ObjectId(),
      name: 'Elsewhere',
      scheduleId: id,
    })
    expect(await repo.deleteSchedule(biz, id.toHexString())).toEqual({
      ok: true,
    })
  })
})

describe('a saved schedule is what the slot engine reads', () => {
  it('feeds computeSlots, on a normal day and on override dates', async () => {
    const biz = await makeBusiness('alice', 'alice-biz')
    const made = await repo.createSchedule(biz, salon())
    if (!made.ok) throw new Error('expected ok')
    const doc = (await repo.getSchedule(biz, made.schedule._id.toHexString()))!

    // The stored document is a valid engine schedule as it is.
    const schedule = scheduleRulesSchema.parse({
      timezone: doc.timezone,
      weekly: doc.weekly,
      overrides: doc.overrides,
    })
    const slots = computeSlots({
      service: {
        durationMin: 60,
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
        startIntervalMin: 60,
        minNoticeMin: 0,
        windowDays: 365,
      },
      schedule,
      busy: [],
      bookedCountByDate: {},
      range: { from: '2026-12-22', to: '2026-12-28' },
      now: new Date('2026-11-16T12:00:00Z'),
    })
    const hours = (date: string) =>
      slots[date]!.map((iso) =>
        new Date(iso).toLocaleTimeString('en-GB', {
          timeZone: 'America/Denver',
          hour: '2-digit',
          minute: '2-digit',
        }),
      )

    // Tue 22 Dec: normal 9:00 to 18:00.
    expect(hours('2026-12-22')).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
    ])
    // Wed 23 Dec: same.
    expect(slots['2026-12-23']).toHaveLength(9)
    // Thu 24 Dec: override 9:00 to 13:00 (a short day), not the lunch-gap hours.
    expect(hours('2026-12-24')).toEqual(['09:00', '10:00', '11:00', '12:00'])
    // Fri 25 Dec: closed by an override.
    expect(slots['2026-12-25']).toEqual([])
    // Sat 26 Dec: normal 10:00 to 15:00.
    expect(hours('2026-12-26')).toEqual([
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
    ])
    // Sun 27 Dec: normally closed.
    expect(slots['2026-12-27']).toEqual([])
    // Mon 28 Dec: normally closed, opened by an override 10:00 to 16:00.
    expect(hours('2026-12-28')).toEqual([
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
    ])
  })

  it('respects the lunch gap on a normal Thursday', async () => {
    const biz = await makeBusiness('alice', 'alice-biz')
    const made = await repo.createSchedule(biz, salon())
    if (!made.ok) throw new Error('expected ok')
    const slots = computeSlots({
      service: {
        durationMin: 60,
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
        startIntervalMin: 30,
        minNoticeMin: 0,
        windowDays: 365,
      },
      schedule: scheduleRulesSchema.parse(made.schedule),
      busy: [],
      bookedCountByDate: {},
      range: { from: '2026-12-17', to: '2026-12-17' },
      now: new Date('2026-11-16T12:00:00Z'),
    })
    const local = slots['2026-12-17']!.map((iso) =>
      new Date(iso).toLocaleTimeString('en-GB', {
        timeZone: 'America/Denver',
        hour: '2-digit',
        minute: '2-digit',
      }),
    )
    expect(local).not.toContain('12:30')
    expect(local).not.toContain('13:00')
    expect(local).toContain('11:30')
    expect(local).toContain('13:30')
    expect(local.at(-1)).toBe('19:00')
  })
})
