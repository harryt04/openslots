import { MongoMemoryServer } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { ServiceFormValues } from '../services/schema'

type Client = typeof import('../mongo-client')
type Lookup = typeof import('./lookup')

let mongo: MongoMemoryServer
let client: Client
let lookup: Lookup
let businesses: typeof import('../businesses/repository')
let services: typeof import('../services/repository')
let security: typeof import('../public-api/security')

const tokenA = 'A'.repeat(43)
const tokenB = 'B'.repeat(43)

const serviceValues = (
  name: string,
  scheduleId: ObjectId,
): ServiceFormValues => ({
  name,
  description: 'Hello',
  color: 'blue',
  durationMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  startIntervalMin: 30,
  minNoticeMin: 120,
  windowDays: 60,
  scheduleId: scheduleId.toHexString(),
  askPhone: false,
  askNotes: false,
})

async function business(owner: string, slug: string) {
  const result = await businesses.createBusiness(owner, {
    name: `Shop ${slug}`,
    slug,
    timezone: 'America/Denver',
  })
  if (!result.ok) throw new Error('setup failed')
  return result.business
}

async function booking(businessId: ObjectId, token: string, extra = {}) {
  await (await client.getDb()).collection('bookings').insertOne({
    _id: new ObjectId(),
    businessId,
    manageTokenHash: security.tokenHash(token),
    status: 'confirmed',
    ...extra,
  })
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  process.env.BETTER_AUTH_URL = 'https://slots.example.com/app'
  client = await import('../mongo-client')
  lookup = await import('./lookup')
  businesses = await import('../businesses/repository')
  services = await import('../services/repository')
  security = await import('../public-api/security')
  await (
    await import('../mongo-utils')
  ).createMongoDbIndexes(client.mongoDBConfig.dbName)
}, 120_000)

afterAll(async () => {
  await client.closeMongoClient()
  await mongo.stop()
})

beforeEach(async () => {
  const db = await client.getDb()
  for (const name of ['businesses', 'services', 'schedules', 'bookings']) {
    await db.collection(name).deleteMany({})
  }
})

describe('business by slug', () => {
  it('finds the business and nothing about its owner', async () => {
    const a = await business('user-a', 'alpha')
    const found = await lookup.findBusinessBySlug('alpha')
    expect(found).toEqual({
      id: a._id.toHexString(),
      name: 'Shop alpha',
      slug: 'alpha',
      timezone: 'America/Denver',
      publishableKey: a.publishableKey,
    })
    expect(JSON.stringify(found)).not.toContain('user-a')
  })

  it('returns null for unknown and malformed slugs', async () => {
    await business('user-a', 'alpha')
    expect(await lookup.findBusinessBySlug('beta')).toBeNull()
    expect(await lookup.findBusinessBySlug('Alpha')).toBeNull()
    expect(await lookup.findBusinessBySlug('{"$ne":""}')).toBeNull()
  })
})

describe('active service by slug', () => {
  it('finds only active services of that business', async () => {
    const a = await business('user-a', 'alpha')
    const b = await business('user-b', 'beta')
    const scheduleA = await (
      await client.getDb()
    )
      .collection('schedules')
      .findOne({ businessId: a._id })
    if (!scheduleA) throw new Error('no schedule')
    const trim = await services.createService(
      a._id,
      serviceValues('Trim', scheduleA._id),
      scheduleA._id,
    )

    expect(
      (await lookup.findActiveServiceBySlug(a._id.toHexString(), 'trim'))?.id,
    ).toBe(trim._id.toHexString())
    // Another business's id cannot reach it.
    expect(
      await lookup.findActiveServiceBySlug(b._id.toHexString(), 'trim'),
    ).toBeNull()

    await services.setServiceActive(a._id, trim._id.toHexString(), false)
    expect(
      await lookup.findActiveServiceBySlug(a._id.toHexString(), 'trim'),
    ).toBeNull()
    expect(await lookup.findActiveServiceBySlug('nope', 'trim')).toBeNull()
  })
})

describe('business for a manage token', () => {
  it("gives the booking's own business, never another", async () => {
    const a = await business('user-a', 'alpha')
    const b = await business('user-b', 'beta')
    await booking(a._id, tokenA)
    await booking(b._id, tokenB)
    expect((await lookup.findBusinessForManageToken(tokenA))?.slug).toBe(
      'alpha',
    )
    expect(
      (await lookup.findBusinessForManageToken(tokenA))?.publishableKey,
    ).toBe(a.publishableKey)
    expect((await lookup.findBusinessForManageToken(tokenB))?.slug).toBe('beta')
  })

  it('returns null for unknown, malformed or abandoned tokens', async () => {
    const a = await business('user-a', 'alpha')
    await booking(a._id, tokenA, { abandoned: true })
    expect(await lookup.findBusinessForManageToken(tokenA)).toBeNull()
    expect(await lookup.findBusinessForManageToken('C'.repeat(43))).toBeNull()
    expect(await lookup.findBusinessForManageToken('short')).toBeNull()
    expect(await lookup.findBusinessForManageToken('')).toBeNull()
  })
})

describe('instance origin', () => {
  it('is the origin of BETTER_AUTH_URL without its path', () => {
    expect(lookup.instanceOrigin()).toBe('https://slots.example.com')
  })
})
