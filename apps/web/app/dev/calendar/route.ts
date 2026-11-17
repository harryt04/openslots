import { z } from 'zod'
import { requireSession } from '@/lib/session'
import { ownedAccounts } from '@/lib/calendar-links/repository'
import { isFakeGoogle } from '@/lib/env'
import { seedFakeCalendar, type FakeState } from '@/lib/calendar/fake'

// Fake-only test harness. PUT resets an account and GET inspects its operations.
const globalFake = globalThis as typeof globalThis & {
  openSlotsCalendars?: Map<string, FakeState>
}
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production' || !isFakeGoogle())
    return new Response(null, { status: 404 })
  const id = new URL(request.url).searchParams.get('accountId')
  if (!id) return new Response(null, { status: 400 })
  const session = await requireSession()
  if (!(await ownedAccounts(session.user.id)).some((a) => a.id === id))
    return new Response(null, { status: 403 })
  return Response.json(
    globalFake.openSlotsCalendars?.get(id) ?? seedFakeCalendar(id),
  )
}
export async function PUT(request: Request) {
  if (process.env.NODE_ENV === 'production' || !isFakeGoogle())
    return new Response(null, { status: 404 })
  const id = new URL(request.url).searchParams.get('accountId')
  if (!id) return new Response(null, { status: 400 })
  const session = await requireSession()
  if (!(await ownedAccounts(session.user.id)).some((a) => a.id === id))
    return new Response(null, { status: 403 })
  const seed = await request.json()
  return Response.json(seedFakeCalendar(id, seed))
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' || !isFakeGoogle())
    return new Response(null, { status: 404 })
  const session = await requireSession()
  const data = z
    .object({
      email: z.string(),
      authFailure: z.boolean(),
    })
    .parse(await request.json())
  const account = (await ownedAccounts(session.user.id)).find(
    (a) => a.email === data.email,
  )
  if (!account) return new Response(null, { status: 403 })
  const state =
    globalFake.openSlotsCalendars?.get(account.id) ??
    seedFakeCalendar(account.id)
  state.authFailure = data.authFailure
  return Response.json({ ok: true })
}
