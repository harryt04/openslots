import { beginReturn } from '@/lib/calendar-links/returns'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { requireBusiness } from '@/lib/businesses/current'
import { ownedAccounts } from '@/lib/calendar-links/repository'
import { getDb } from '@/lib/mongo-client'
import { isFakeGoogle } from '@/lib/env'
import { seedFakeCalendar } from '@/lib/calendar/fake'
export async function POST(request: Request) {
  const { session, business } = await requireBusiness()
  const data = z
    .object({ accountId: z.string().optional() })
    .parse(await request.json())
  const nonce = await beginReturn(business, session.user.id, data.accountId)
  const callbackURL = `/calendars/return?nonce=${nonce}`
  if (!isFakeGoogle()) return Response.json({ fake: false, callbackURL })
  let id = data.accountId
  if (id && !(await ownedAccounts(session.user.id)).some((a) => a.id === id))
    return new Response(null, { status: 403 })
  if (!id) {
    const _id = new ObjectId()
    id = String(_id)
    await (await getDb()).collection('account').insertOne({
      _id,
      providerId: 'google',
      accountId: crypto.randomUUID(),
      userId: session.user.id,
      email: `second-${id.slice(-4)}@example.com`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }
  seedFakeCalendar(id, {
    calendars: [
      { id: 'primary', primary: true, summary: 'Work', accessRole: 'owner' },
      { id: 'personal', summary: 'Personal', accessRole: 'writer' },
      { id: 'holidays', summary: 'Holidays', accessRole: 'reader' },
    ],
  })
  return Response.json({ fake: true, callbackURL })
}
