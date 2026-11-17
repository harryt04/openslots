import { describe, expect, it, vi } from 'vitest'
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
