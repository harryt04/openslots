import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

type Repo = typeof import('./repository')
type Utils = typeof import('../mongo-utils')
type Client = typeof import('../mongo-client')

let mongo: MongoMemoryServer
let repo: Repo
let utils: Utils
let client: Client

const input = (slug: string, name = 'Shop') => ({
  name,
  slug,
  timezone: 'Europe/London',
})

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  client = await import('../mongo-client')
  utils = await import('../mongo-utils')
  repo = await import('./repository')
  await utils.createMongoDbIndexes(client.mongoDBConfig.dbName)
}, 120_000)

afterAll(async () => {
  await client.closeMongoClient()
  await mongo.stop()
})

beforeEach(async () => {
  const db = await client.getDb()
  await db.collection('businesses').deleteMany({})
  await db.collection('schedules').deleteMany({})
})

describe('businesses repository: ownership scoping', () => {
  it('creates a business with a key and a default schedule', async () => {
    const created = await repo.createBusiness('alice', input('alices-shop'))
    if (!created.ok) throw new Error('expected ok')
    expect(created.business.publishableKey).toMatch(/^os_pk_/)
    const schedules = await (
      await client.getDb()
    )
      .collection('schedules')
      .find({ businessId: created.business._id })
      .toArray()
    expect(schedules).toHaveLength(1)
    const weekly = schedules[0]?.weekly as {
      startMin: number
      endMin: number
    }[][]
    expect(weekly).toHaveLength(7)
    expect(weekly[0]).toEqual([])
    expect(weekly[6]).toEqual([])
    for (const day of [1, 2, 3, 4, 5]) {
      expect(weekly[day]).toEqual([{ startMin: 540, endMin: 1020 }])
    }
    expect(schedules[0]?.timezone).toBe('Europe/London')
  })

  it("never lets one user read, list, update or switch to another's business", async () => {
    const a = await repo.createBusiness('alice', input('alice-biz', 'Alice'))
    const b = await repo.createBusiness('bob', input('bob-biz', 'Bob'))
    if (!a.ok || !b.ok) throw new Error('expected ok')
    const aliceId = a.business._id.toHexString()
    const bobId = b.business._id.toHexString()

    expect(await repo.getBusinessForUser('bob', aliceId)).toBeNull()
    expect(await repo.getBusinessForUser('alice', bobId)).toBeNull()
    expect(await repo.getBusinessForUser('alice', aliceId)).not.toBeNull()

    const bobList = await repo.listBusinessesForUser('bob')
    expect(bobList.map((x) => x.name)).toEqual(['Bob'])

    const hijack = await repo.updateBusinessForUser(
      'bob',
      aliceId,
      input('hijacked', 'Hijacked'),
    )
    expect(hijack).toEqual({ ok: false, error: 'not_found' })
    const untouched = await repo.getBusinessForUser('alice', aliceId)
    expect(untouched?.name).toBe('Alice')
    expect(untouched?.slug).toBe('alice-biz')
  })

  it('falls back to an owned business when the remembered id is forged', async () => {
    const a = await repo.createBusiness('alice', input('alice-1', 'Alice 1'))
    const a2 = await repo.createBusiness('alice', input('alice-2', 'Alice 2'))
    const b = await repo.createBusiness('bob', input('bob-1', 'Bob 1'))
    if (!a.ok || !a2.ok || !b.ok) throw new Error('expected ok')

    const second = await repo.resolveCurrentBusiness(
      'alice',
      a2.business._id.toHexString(),
    )
    expect(second?.current.name).toBe('Alice 2')

    for (const forged of [
      b.business._id.toHexString(),
      'not-an-id',
      '',
      undefined,
    ]) {
      const resolved = await repo.resolveCurrentBusiness('alice', forged)
      expect(resolved?.current.ownerUserId).toBe('alice')
      expect(resolved?.current.name).toBe('Alice 1')
    }
    expect(await repo.resolveCurrentBusiness('nobody', undefined)).toBeNull()
  })

  it('keeps slugs and publishable keys unique', async () => {
    const first = await repo.createBusiness('alice', input('taken'))
    expect(first.ok).toBe(true)
    const dup = await repo.createBusiness('bob', input('taken'))
    expect(dup).toEqual({ ok: false, error: 'slug_taken' })
    expect(await repo.listBusinessesForUser('bob')).toHaveLength(0)

    const other = await repo.createBusiness('bob', input('free'))
    if (!first.ok || !other.ok) throw new Error('expected ok')
    expect(first.business.publishableKey).not.toBe(
      other.business.publishableKey,
    )

    const clash = await repo.updateBusinessForUser(
      'bob',
      other.business._id.toHexString(),
      input('taken'),
    )
    expect(clash).toEqual({ ok: false, error: 'slug_taken' })

    const db = await client.getDb()
    await expect(
      db.collection('businesses').insertOne({
        ownerUserId: 'x',
        slug: 'unique-slug',
        publishableKey: first.business.publishableKey,
      }),
    ).rejects.toMatchObject({ code: 11000 })
  })

  it('updates the owner’s business', async () => {
    const a = await repo.createBusiness('alice', input('before', 'Before'))
    if (!a.ok) throw new Error('expected ok')
    const updated = await repo.updateBusinessForUser(
      'alice',
      a.business._id.toHexString(),
      input('after', 'After'),
    )
    if (!updated.ok) throw new Error('expected ok')
    expect(updated.business.slug).toBe('after')
    expect(updated.business.name).toBe('After')
  })
})

describe('creating a business without transactions', () => {
  it('removes the business again when its first schedule cannot be written', async () => {
    await expect(
      repo.createBusiness('user-a', input('half-made'), async () => {
        throw new Error('schedule write failed')
      }),
    ).rejects.toThrow('schedule write failed')

    expect(await repo.listBusinessesForUser('user-a')).toEqual([])
    // The slug is free again, so the owner can retry.
    const retry = await repo.createBusiness('user-a', input('half-made'))
    expect(retry.ok).toBe(true)
  })
})

describe('switching business', () => {
  it('accepts only a canonical id of a business the user owns', async () => {
    const mine = await repo.createBusiness('user-a', input('mine'))
    const theirs = await repo.createBusiness('user-b', input('theirs'))
    if (!mine.ok || !theirs.ok) throw new Error('expected ok')
    const myId = mine.business._id.toHexString()
    const theirId = theirs.business._id.toHexString()

    expect((await repo.resolveSwitchTarget('user-a', myId))?.slug).toBe('mine')
    expect(await repo.resolveSwitchTarget('user-a', theirId)).toBeNull()

    for (const forged of [
      [myId],
      { toString: () => myId },
      { $ne: null },
      myId.toUpperCase(),
      `${myId} `,
      '',
      null,
      undefined,
      42,
    ]) {
      expect(await repo.resolveSwitchTarget('user-a', forged)).toBeNull()
    }
  })
})

// Written out from TRD section 3 rather than read from the implementation,
// so removing or changing an index definition fails this test.
const TRD_INDEXES: Record<
  string,
  { key: Record<string, 1>; unique: boolean }[]
> = {
  businesses: [
    { key: { slug: 1 }, unique: true },
    { key: { publishableKey: 1 }, unique: true },
    { key: { ownerUserId: 1 }, unique: false },
  ],
  services: [{ key: { businessId: 1, slug: 1 }, unique: true }],
  schedules: [{ key: { businessId: 1 }, unique: false }],
  calendar_links: [{ key: { businessId: 1, accountId: 1 }, unique: true }],
  cap_locks: [
    { key: { businessId: 1, capKey: 1 }, unique: true },
    { key: { opId: 1 }, unique: false },
    { key: { bookingId: 1 }, unique: false },
    { key: { createdAt: 1 }, unique: false },
  ],
  bookings: [
    { key: { status: 1, expiresAt: 1 }, unique: false },
    { key: { cleanup: 1, syncAt: 1, retryAt: 1 }, unique: false },
    { key: { eventSync: 1, syncAt: 1, retryAt: 1 }, unique: false },
    { key: { 'pendingOp.startedAt': 1 }, unique: false },
    { key: { status: 1, purgeAfter: 1, syncAt: 1, retryAt: 1 }, unique: false },
    { key: { status: 1, locksReleased: 1, end: 1 }, unique: false },
    { key: { businessId: 1, prevStart: 1, prevEnd: 1 }, unique: false },
    {
      key: { businessId: 1, serviceId: 1, status: 1, capManaged: 1, start: 1 },
      unique: false,
    },
    { key: { businessId: 1, start: 1 }, unique: false },
    { key: { manageTokenHash: 1 }, unique: true },
    { key: { businessId: 1, status: 1, start: 1 }, unique: false },
  ],
  slot_locks: [
    { key: { businessId: 1, block: 1 }, unique: true },
    { key: { bookingId: 1 }, unique: false },
    { key: { opId: 1 }, unique: false },
    { key: { createdAt: 1 }, unique: false },
  ],
}

describe('create-indexes', () => {
  it('is idempotent and creates exactly the indexes of TRD section 3', async () => {
    await utils.createMongoDbIndexes(client.mongoDBConfig.dbName)
    await utils.createMongoDbIndexes(client.mongoDBConfig.dbName)
    const db = await client.getDb()

    for (const [name, expected] of Object.entries(TRD_INDEXES)) {
      const actual = (await db.collection(name).indexes())
        .filter((i) => i.name !== '_id_')
        .map((i) => ({ key: i.key, unique: Boolean(i.unique) }))
      // toEqual on arrays of objects ignores key order inside `key`, so
      // compare the ordered field lists as well.
      expect(actual, name).toHaveLength(expected.length)
      for (const want of expected) {
        const found = actual.find(
          (i) =>
            JSON.stringify(Object.entries(i.key)) ===
            JSON.stringify(Object.entries(want.key)),
        )
        expect(found, `${name} ${JSON.stringify(want.key)}`).toBeDefined()
        expect(found?.unique, `${name} ${JSON.stringify(want.key)}`).toBe(
          want.unique,
        )
      }
    }

    await db.collection('slot_locks').insertOne({ businessId: 'b', block: 1 })
    await expect(
      db.collection('slot_locks').insertOne({ businessId: 'b', block: 1 }),
    ).rejects.toMatchObject({ code: 11000 })
  })
})
