import { MongoMemoryServer } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const tenant = vi.hoisted(() => ({
  business: { _id: null as unknown as ObjectId, timezone: 'America/Denver' },
  signedIn: true,
}))
vi.mock('../businesses/current', () => ({
  requireBusiness: async () => {
    if (!tenant.signedIn) throw Error('Sign in required')
    return tenant
  },
}))
let mongo: MongoMemoryServer
let client: typeof import('../mongo-client')
beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  client = await import('../mongo-client')
  tenant.business._id = new ObjectId()
})
afterAll(async () => {
  await client.closeMongoClient()
  await mongo.stop()
})
test('schedule actions scope foreign ids and ignore client tenant injection; no session makes no writes', async () => {
  const db = await client.getDb()
  const { defaultWeekly } = await import('./defaults')
  const input = {
    name: 'Private hours',
    timezone: 'America/Denver',
    weekly: defaultWeekly(),
    overrides: [],
  }
  const foreign = { _id: new ObjectId(), businessId: new ObjectId(), ...input }
  await db.collection('schedules').insertOne(foreign)
  const { saveScheduleAction, createScheduleAction, deleteScheduleAction } =
    await import('../../app/actions/schedules')
  for (const id of [String(foreign._id), 'malformed']) {
    expect(
      await saveScheduleAction(id, {
        ...input,
        name: 'Hijacked',
        businessId: String(foreign.businessId),
      }),
    ).toEqual({ ok: false, message: 'That schedule no longer exists.' })
    expect(await deleteScheduleAction(id)).toMatchObject({ ok: false })
    expect(
      await db.collection('schedules').findOne({ _id: foreign._id }),
    ).toEqual(foreign)
  }
  expect(await createScheduleAction()).toMatchObject({ ok: true })
  expect(
    await db
      .collection('schedules')
      .countDocuments({ businessId: foreign.businessId }),
  ).toBe(1)
  expect(
    await db
      .collection('schedules')
      .countDocuments({ businessId: tenant.business._id }),
  ).toBe(1)
  const before = await db.collection('schedules').find().toArray()
  tenant.signedIn = false
  try {
    for (const operation of [
      () => saveScheduleAction(String(foreign._id), input),
      createScheduleAction,
      () => deleteScheduleAction(String(foreign._id)),
    ])
      await expect(operation()).rejects.toThrow('Sign in required')
    expect(await db.collection('schedules').find().toArray()).toEqual(before)
  } finally {
    tenant.signedIn = true
  }
})
