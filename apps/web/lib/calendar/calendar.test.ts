import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { GoogleCalendarProvider } from './google'
import { FakeCalendarProvider, seedFakeCalendar } from './fake'
import { CalendarAuthError, CalendarError } from './types'
const event = {
  summary: 'Booking',
  start: { dateTime: '2026-12-01T10:00:00Z' },
  end: { dateTime: '2026-12-01T11:00:00Z' },
  attendees: [{ email: 'customer@example.test' }],
}
describe('Google calendar REST adapter', () => {
  it('uses fresh tokens and paginates calendar metadata only', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          items: [{ id: 'a', summary: 'A' }],
          nextPageToken: 'next',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: 'b', summary: 'B' }] }),
      )
    const token = vi.fn().mockResolvedValue('server-token')
    const provider = new GoogleCalendarProvider(token, request)
    expect(await provider.listCalendars()).toHaveLength(2)
    expect(token).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1]?.[0]).toContain('calendarList?pageToken=next')
  })
  it('distinguishes expired access, revoked refresh and other failures', async () => {
    await expect(
      new GoogleCalendarProvider(
        async () => 'expired',
        vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
      ).listCalendars(),
    ).rejects.toBeInstanceOf(CalendarAuthError)
    await expect(
      new GoogleCalendarProvider(async () => {
        throw new CalendarAuthError()
      }).listCalendars(),
    ).rejects.toBeInstanceOf(CalendarAuthError)
    await expect(
      new GoogleCalendarProvider(
        async () => 'token',
        vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
      ).listCalendars(),
    ).rejects.toBeInstanceOf(CalendarError)
  })
  it('reads only busy intervals and fails closed on individual calendar errors', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ calendars: { a: { busy: [] } } }))
      .mockResolvedValueOnce(
        Response.json({
          calendars: { a: { errors: [{ reason: 'notFound' }] } },
        }),
      )
    const provider = new GoogleCalendarProvider(async () => 'token', request)
    expect(await provider.freeBusy(['a'], 'from', 'to')).toEqual({ a: [] })
    expect(JSON.parse(request.mock.calls[0]?.[1]?.body as string)).toEqual({
      timeMin: 'from',
      timeMax: 'to',
      items: [{ id: 'a' }],
    })
    await expect(provider.freeBusy(['a'], 'from', 'to')).rejects.toBeInstanceOf(
      CalendarError,
    )
  })
  it('writes escaped event paths with Google attendee notifications', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'created' }))
      .mockResolvedValueOnce(Response.json({ id: 'created' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const provider = new GoogleCalendarProvider(async () => 'token', request)
    expect(await provider.createEvent('a/b', event)).toEqual({ id: 'created' })
    await provider.updateEvent('a/b', 'created', event)
    await provider.deleteEvent('a/b', 'created')
    expect(request.mock.calls.map((call) => call[1]?.method)).toEqual([
      'POST',
      'PATCH',
      'DELETE',
    ])
    expect(
      request.mock.calls.every(
        (call) =>
          String(call[0]).includes('a%2Fb/events') &&
          String(call[0]).endsWith('?sendUpdates=all'),
      ),
    ).toBe(true)
  })
})
describe('shared fake calendar', () => {
  it('shares seeded state across instances, records lifecycle and isolates accounts', async () => {
    const state = seedFakeCalendar('owner')
    const first = new FakeCalendarProvider('owner'),
      second = new FakeCalendarProvider('owner')
    const { id } = await first.createEvent('primary', event)
    expect(
      (await second.freeBusy(['primary'], '2026-12-01', '2026-12-02')).primary,
    ).toHaveLength(1)
    await second.updateEvent('primary', id, { ...event, summary: 'Moved' })
    await first.deleteEvent('primary', id)
    expect(state.operations.map((op) => op.kind)).toEqual([
      'create',
      'update',
      'delete',
    ])
    expect(
      await new FakeCalendarProvider('other').freeBusy(
        ['primary'],
        '2026-12-01',
        '2026-12-02',
      ),
    ).toEqual({ primary: [] })
    state.authFailure = true
    await expect(second.listCalendars()).rejects.toBeInstanceOf(
      CalendarAuthError,
    )
  })
})

it.each([
  ['insufficientPermissions', true],
  ['authError', true],
  ['ACCESS_TOKEN_SCOPE_INSUFFICIENT', true],
  // Reconnecting cannot fix these, so they must not mark a link broken.
  ['forbidden', false],
  ['forbiddenForNonOrganizer', false],
  ['rateLimitExceeded', false],
  ['userRateLimitExceeded', false],
])('classifies Google 403 %s (needs reconnect: %s)', async (reason, isAuth) => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json(
        { error: { status: reason, errors: [{ reason }] } },
        { status: 403 },
      ),
    )
  const error = await new GoogleCalendarProvider(async () => 'token', request)
    .listCalendars()
    .catch((e: unknown) => e)
  expect(error).toBeInstanceOf(isAuth ? CalendarAuthError : CalendarError)
})
it.each([404, 410])('delete tolerates missing event %s', async (status) => {
  await new GoogleCalendarProvider(
    async () => 'token',
    vi.fn().mockResolvedValue(new Response(null, { status })),
  ).deleteEvent('primary', 'gone')
})
it('retries create with a stable event id without duplicating fake events', async () => {
  const provider = new GoogleCalendarProvider(
    async () => 'token',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { errors: [{ reason: 'duplicate' }] } },
          { status: 409 },
        ),
      ),
  )
  expect(
    await provider.createEvent('primary', { ...event, id: 'abc123' }),
  ).toEqual({ id: 'abc123' })
  const state = seedFakeCalendar('retry')
  const fake = new FakeCalendarProvider('retry')
  await fake.createEvent('primary', { ...event, id: 'abc123' })
  await fake.createEvent('primary', { ...event, id: 'abc123' })
  expect(Object.keys(state.events)).toHaveLength(1)
  await fake.deleteEvent('primary', 'abc123')
  await fake.deleteEvent('primary', 'abc123')
})
it('compares mixed offset intervals as instants', async () => {
  seedFakeCalendar('offset', {
    busy: {
      primary: [
        {
          start: '2026-12-01T12:00:00+02:00',
          end: '2026-12-01T13:00:00+02:00',
        },
      ],
    },
  })
  expect(
    (
      await new FakeCalendarProvider('offset').freeBusy(
        ['primary'],
        '2026-12-01T10:30:00Z',
        '2026-12-01T11:30:00Z',
      )
    ).primary,
  ).toHaveLength(1)
})
it('passes a deadline and treats timeouts as transient', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new DOMException('Timeout', 'TimeoutError'))
  await expect(
    new GoogleCalendarProvider(async () => 'token', request).listCalendars(),
  ).rejects.toBeInstanceOf(CalendarError)
  expect(request.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
})

it('checks the deadline after token acquisition immediately before fetch', async () => {
  const request = vi.fn<typeof fetch>()
  const provider = new GoogleCalendarProvider(async () => 'token', request)
  await expect(
    provider.createEvent('primary', event, Date.now() - 1),
  ).rejects.toBeInstanceOf(CalendarError)
  await expect(
    provider.updateEvent('primary', 'id', event, Date.now() - 1),
  ).rejects.toBeInstanceOf(CalendarError)
  await expect(
    provider.deleteEvent('primary', 'id', Date.now() - 1),
  ).rejects.toBeInstanceOf(CalendarError)
  expect(request).not.toHaveBeenCalled()
})
it('a paused fake patch cannot land after its deadline and cancelled events restore on patch', async () => {
  const state = seedFakeCalendar('deadline')
  const provider = new FakeCalendarProvider('deadline')
  const { id } = await provider.createEvent('primary', {
    ...event,
    id: 'stable',
  })
  await provider.deleteEvent('primary', id)
  await provider.createEvent('primary', { ...event, id })
  expect(state.events[id]!.event.status).toBe('cancelled')
  await provider.updateEvent('primary', id, { ...event, status: 'confirmed' })
  expect(state.events[id]!.event.status).toBe('confirmed')
  let resume!: () => void
  state.pause = () =>
    new Promise<void>((resolve) => {
      resume = resolve
    })
  const pending = provider.updateEvent(
    'primary',
    id,
    { ...event, summary: 'stale' },
    Date.now() + 1000,
  )
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000)
  resume()
  try {
    await expect(pending).rejects.toBeInstanceOf(CalendarError)
  } finally {
    clock.mockRestore()
  }
  expect(state.events[id]!.event.summary).toBe('Booking')
})
