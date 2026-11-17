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
  return Response.json(
    globalFake.openSlotsCalendars?.get(id) ?? seedFakeCalendar(id),
  )
}
export async function PUT(request: Request) {
  if (process.env.NODE_ENV === 'production' || !isFakeGoogle())
    return new Response(null, { status: 404 })
  const id = new URL(request.url).searchParams.get('accountId')
  if (!id) return new Response(null, { status: 400 })
  const seed = await request.json()
  return Response.json(seedFakeCalendar(id, seed))
}
