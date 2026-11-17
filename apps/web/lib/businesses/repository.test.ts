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

describe('create-indexes', () => {
  it('is idempotent and defines every TRD index, including slot_locks', async () => {
    await utils.createMongoDbIndexes(client.mongoDBConfig.dbName)
    await utils.createMongoDbIndexes(client.mongoDBConfig.dbName)
    const db = await client.getDb()

    for (const [name, specs] of Object.entries(utils.indexes)) {
      const actual = await db.collection(name).indexes()
      for (const spec of specs) {
        const found = actual.find((i) => i.name === spec.name)
        expect(found, `${name}.${spec.name}`).toBeDefined()
        expect(Boolean(found?.unique)).toBe(Boolean(spec.unique))
      }
    }

    const locks = await db.collection('slot_locks').indexes()
    const unique = locks.find((i) => i.unique && i.key?.block === 1)
    expect(unique?.key).toEqual({ businessId: 1, block: 1 })

    await db.collection('slot_locks').insertOne({ businessId: 'b', block: 1 })
    await expect(
      db.collection('slot_locks').insertOne({ businessId: 'b', block: 1 }),
    ).rejects.toMatchObject({ code: 11000 })
  })
})
