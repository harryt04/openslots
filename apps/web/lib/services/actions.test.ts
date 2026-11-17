import { MongoMemoryServer } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const tenant = vi.hoisted(() => ({ business: {} as { _id: ObjectId } }))
vi.mock('../businesses/current', () => ({
  requireBusiness: async () => tenant,
}))
let mongo: MongoMemoryServer
let client: typeof import('../mongo-client')
beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  client = await import('../mongo-client')
  tenant.business = { _id: new ObjectId() }
})
afterAll(async () => {
  await client.closeMongoClient()
  await mongo.stop()
})

test('create and update refuse a real schedule belonging to another business', async () => {
  const db = await client.getDb()
  const own = new ObjectId(),
    foreign = new ObjectId()
  await db.collection('schedules').insertMany([
    { _id: own, businessId: tenant.business._id },
    { _id: foreign, businessId: new ObjectId() },
  ])
  const input = {
    name: 'Trim',
    description: '',
    color: 'blue',
    durationMin: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    startIntervalMin: 30,
    minNoticeMin: 120,
    windowDays: 60,
    scheduleId: String(own),
    askPhone: false,
    askNotes: false,
  }
  const { createServiceAction, updateServiceAction } =
    await import('../../app/actions/services')
  expect(await createServiceAction(input)).toMatchObject({ ok: true })
  const service = await db
    .collection('services')
    .findOne({ businessId: tenant.business._id })
  expect(service).not.toBeNull()
  const bad = { ...input, name: 'Hijacked', scheduleId: String(foreign) }
  const refusal = {
    ok: false,
    fieldErrors: { scheduleId: 'Choose a schedule.' },
  }
  expect(await createServiceAction(bad)).toEqual(refusal)
  expect(await updateServiceAction(String(service!._id), bad)).toEqual(refusal)
  expect(await db.collection('services').countDocuments({})).toBe(1)
  expect(
    await db.collection('services').findOne({ _id: service!._id }),
  ).toMatchObject({ name: 'Trim', scheduleId: own })
})
