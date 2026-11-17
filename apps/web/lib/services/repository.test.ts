import { MongoMemoryServer } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { ServiceFormValues } from './schema'

type Repo = typeof import('./repository')
type Schedules = typeof import('./schedules')
type Utils = typeof import('../mongo-utils')
type Client = typeof import('../mongo-client')

let mongo: MongoMemoryServer
let repo: Repo
let schedules: Schedules
let utils: Utils
let client: Client

const scheduleA = new ObjectId()
const scheduleB = new ObjectId()
const businessA = new ObjectId()
const businessB = new ObjectId()

const values = (over: Partial<ServiceFormValues> = {}): ServiceFormValues => ({
  name: 'Trim',
  description: '',
  color: 'blue',
  durationMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  startIntervalMin: 30,
  minNoticeMin: 120,
  windowDays: 60,
  scheduleId: scheduleA.toHexString(),
  askPhone: false,
  askNotes: false,
  ...over,
})

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  client = await import('../mongo-client')
  utils = await import('../mongo-utils')
  repo = await import('./repository')
  schedules = await import('./schedules')
  await utils.createMongoDbIndexes(client.mongoDBConfig.dbName)
}, 120_000)

afterAll(async () => {
  await client.closeMongoClient()
  await mongo.stop()
})

beforeEach(async () => {
  const db = await client.getDb()
  await db.collection('services').deleteMany({})
  await db.collection('schedules').deleteMany({})
})

describe('services repository: business scoping', () => {
  it("never lets one business read, list, update, pause or delete another's service", async () => {
    const alice = await repo.createService(businessA, values(), scheduleA)
    const aliceId = alice._id.toHexString()

    expect(await repo.getService(businessB, aliceId)).toBeNull()
    expect(await repo.listServices(businessB)).toEqual([])
    expect(await repo.countServices(businessB)).toBe(0)

    expect(
      await repo.updateService(
        businessB,
        aliceId,
        values({ name: 'Hijacked', durationMin: 5 }),
        scheduleB,
      ),
    ).toBeNull()
    expect(await repo.setServiceActive(businessB, aliceId, false)).toBeNull()
    expect(await repo.deleteService(businessB, aliceId)).toBe(false)

    const untouched = await repo.getService(businessA, aliceId)
    expect(untouched).toMatchObject({
      name: 'Trim',
      durationMin: 30,
      active: true,
      scheduleId: scheduleA,
    })
    expect(await repo.listServices(businessA)).toHaveLength(1)
  })

  it('refuses ids that are not canonical ObjectIds', async () => {
    const svc = await repo.createService(businessA, values(), scheduleA)
    const id = svc._id.toHexString()
    for (const forged of [
      { $ne: null },
      [id],
      id.toUpperCase(),
      `${id} `,
      '',
      null,
      undefined,
      42,
    ]) {
      expect(await repo.getService(businessA, forged)).toBeNull()
      expect(await repo.setServiceActive(businessA, forged, false)).toBeNull()
      expect(await repo.deleteService(businessA, forged)).toBe(false)
    }
    expect((await repo.getService(businessA, id))?.active).toBe(true)
  })

  it('updates, pauses, resumes and deletes within the business', async () => {
    const svc = await repo.createService(
      businessA,
      values({ maxPerDay: 2 }),
      scheduleA,
    )
    const id = svc._id.toHexString()
    expect(svc.maxPerDay).toBe(2)

    const updated = await repo.updateService(
      businessA,
      id,
      values({ name: 'Long trim', durationMin: 45 }),
      scheduleB,
    )
    expect(updated).toMatchObject({
      name: 'Long trim',
      durationMin: 45,
      scheduleId: scheduleB,
      // The slug is kept so shared links keep working.
      slug: 'trim',
    })
    // "No limit" removes the cap rather than storing undefined.
    expect(updated).not.toHaveProperty('maxPerDay')

    expect((await repo.setServiceActive(businessA, id, false))?.active).toBe(
      false,
    )
    expect((await repo.getService(businessA, id))?.active).toBe(false)
    expect((await repo.setServiceActive(businessA, id, true))?.active).toBe(
      true,
    )

    expect(await repo.deleteService(businessA, id)).toBe(true)
    expect(await repo.getService(businessA, id)).toBeNull()
    expect(await repo.deleteService(businessA, id)).toBe(false)
  })
})

describe('service slugs', () => {
  it('derives the slug from the name, unique per business', async () => {
    const first = await repo.createService(
      businessA,
      values({ name: 'Cut & Style' }),
      scheduleA,
    )
    const second = await repo.createService(
      businessA,
      values({ name: 'Cut and style' }),
      scheduleA,
    )
    const third = await repo.createService(
      businessA,
      values({ name: 'Cut and style' }),
      scheduleA,
    )
    expect([first.slug, second.slug, third.slug]).toEqual([
      'cut-and-style',
      'cut-and-style-2',
      'cut-and-style-3',
    ])
  })

  it('lets another business reuse the same slug', async () => {
    const a = await repo.createService(businessA, values(), scheduleA)
    const b = await repo.createService(businessB, values(), scheduleB)
    expect(a.slug).toBe('trim')
    expect(b.slug).toBe('trim')
  })

  it('relies on the unique index, so concurrent creates never share a slug', async () => {
    const created = await Promise.all(
      Array.from({ length: 6 }, () =>
        repo.createService(businessA, values({ name: 'Trim' }), scheduleA),
      ),
    )
    const slugs = created.map((s) => s.slug)
    expect(new Set(slugs).size).toBe(6)
    expect(slugs).toContain('trim')
  })

  it('falls back to "service" for a name with no letters or digits', async () => {
    const svc = await repo.createService(
      businessA,
      values({ name: '!!!' }),
      scheduleA,
    )
    expect(svc.slug).toBe('service')
  })
})

describe('schedules for the service editor', () => {
  it('lists and gets only the business’s own schedules', async () => {
    const db = await client.getDb()
    const now = new Date()
    const base = {
      timezone: 'UTC',
      weekly: [[], [], [], [], [], [], []],
      overrides: [],
      createdAt: now,
      updatedAt: now,
    }
    await db.collection('schedules').insertMany([
      { _id: scheduleA, businessId: businessA, name: 'A hours', ...base },
      { _id: scheduleB, businessId: businessB, name: 'B hours', ...base },
    ])
    const list = await schedules.listSchedulesForServices(businessA)
    expect(list.map((s) => s.name)).toEqual(['A hours'])
    expect(
      await schedules.getScheduleForServices(businessA, scheduleB),
    ).toBeNull()
    expect(
      (await schedules.getScheduleForServices(businessA, scheduleA))?.name,
    ).toBe('A hours')
  })
})
