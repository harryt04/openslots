import { API_ERROR_CODES, API_ERROR_STATUS } from '@openslots/core'
import { describe, expect, it, vi } from 'vitest'

import { createClient, OpenSlotsError } from '../src'
import { MOCK_BUSINESS, MOCK_KEY } from '../src/testing'

const HOST = 'https://slots.example.com/'

function respond(status: number, body?: unknown) {
  return vi.fn<typeof fetch>(async () =>
    body === undefined
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
  )
}

async function caught(promise: Promise<unknown>): Promise<OpenSlotsError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(OpenSlotsError)
    return error as OpenSlotsError
  }
  throw new Error('expected the request to fail')
}

const SERVICE = MOCK_BUSINESS.services[0]!.id

describe('createClient', () => {
  it('sends the publishable key, no cookies, to the host only', async () => {
    const fetch = respond(200, MOCK_BUSINESS)
    const client = createClient({ host: HOST, publishableKey: MOCK_KEY, fetch })
    await expect(client.getBusiness()).resolves.toEqual(MOCK_BUSINESS)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://slots.example.com/api/v1/business')
    expect(new Headers(init!.headers).get('X-OpenSlots-Key')).toBe(MOCK_KEY)
    expect(init!.credentials).toBe('omit')
  })

  it('builds the slots query and validates the response', async () => {
    const fetch = respond(200, {
      timezone: 'Europe/London',
      days: { '2026-12-03': ['2026-12-03T16:00:00Z'] },
    })
    const client = createClient({ host: HOST, publishableKey: MOCK_KEY, fetch })
    const slots = await client.getSlots({
      service: SERVICE,
      from: '2026-12-01',
      to: '2026-12-31',
      tz: 'Europe/London',
    })
    expect(slots.days['2026-12-03']).toHaveLength(1)
    const url = new URL(String(fetch.mock.calls[0]![0]))
    expect(url.pathname).toBe('/api/v1/slots')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      service: SERVICE,
      from: '2026-12-01',
      to: '2026-12-31',
      tz: 'Europe/London',
    })
  })

  it('refuses a range over 62 days without calling the server', async () => {
    const fetch = respond(200, {})
    const client = createClient({ host: HOST, publishableKey: MOCK_KEY, fetch })
    const error = await caught(
      client.getSlots({
        service: SERVICE,
        from: '2026-12-01',
        to: '2027-02-15',
      }),
    )
    expect(error.code).toBe('invalid_request')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(API_ERROR_CODES)(
    'maps the %s error body to its code',
    async (code) => {
      const status = API_ERROR_STATUS[code]
      const client = createClient({
        host: HOST,
        publishableKey: MOCK_KEY,
        fetch: respond(status, {
          error: { code, message: `server says ${code}` },
        }),
      })
      const error = await caught(client.getBusiness())
      expect(error.code).toBe(code)
      expect(error.status).toBe(status)
      expect(error.message).toBe(`server says ${code}`)
    },
  )

  it.each([
    [400, 'invalid_request'],
    [401, 'invalid_key'],
    [403, 'origin_not_allowed'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'internal_error'],
    [502, 'calendar_unavailable'],
    [503, 'internal_error'],
  ] as const)('maps a bare %i to %s', async (status, code) => {
    const client = createClient({
      host: HOST,
      publishableKey: MOCK_KEY,
      fetch: respond(status),
    })
    expect((await caught(client.getBusiness())).code).toBe(code)
  })

  it('maps a bare 409 by endpoint', async () => {
    const client = createClient({
      host: HOST,
      publishableKey: MOCK_KEY,
      fetch: respond(409),
    })
    const token = 'a'.repeat(43)
    const body = {
      serviceId: SERVICE,
      start: '2026-12-03T16:00:00Z',
      timezone: 'America/Denver',
      customer: { name: 'Alex', email: 'alex@example.com' },
    }
    expect((await caught(client.createBooking(body))).code).toBe('slot_taken')
    expect((await caught(client.cancelBooking(token))).code).toBe(
      'booking_not_changeable',
    )
  })

  it('turns a failed fetch into network_error', async () => {
    const client = createClient({
      host: HOST,
      publishableKey: MOCK_KEY,
      fetch: vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch')
      }),
    })
    const error = await caught(client.getBusiness())
    expect(error.code).toBe('network_error')
    expect(error.cause).toBeInstanceOf(TypeError)
  })

  it('turns a response outside the contract into invalid_response', async () => {
    const client = createClient({
      host: HOST,
      publishableKey: MOCK_KEY,
      fetch: respond(200, { name: 'No services field' }),
    })
    expect((await caught(client.getBusiness())).code).toBe('invalid_response')
  })

  it('lets an abort through as an AbortError', async () => {
    const controller = new AbortController()
    const client = createClient({
      host: HOST,
      publishableKey: MOCK_KEY,
      fetch: vi.fn<typeof fetch>(async () => {
        controller.abort()
        throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      }),
    })
    await expect(
      client.getBusiness({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('posts bookings and reschedules with validated bodies', async () => {
    const created = {
      id: '64c000000000000000000001',
      start: '2026-12-03T16:00:00Z',
      end: '2026-12-03T17:00:00Z',
      manageUrl: 'https://slots.example.com/m/abc',
    }
    const fetch = respond(201, created)
    const client = createClient({ host: HOST, publishableKey: MOCK_KEY, fetch })
    await expect(
      client.createBooking({
        serviceId: SERVICE,
        start: '2026-12-03T16:00:00Z',
        timezone: 'America/Denver',
        customer: { name: '  Alex  ', email: 'alex@example.com', phone: '' },
        website: '',
      }),
    ).resolves.toEqual(created)
    const init = fetch.mock.calls[0]![1]!
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      serviceId: SERVICE,
      start: '2026-12-03T16:00:00Z',
      timezone: 'America/Denver',
      customer: { name: 'Alex', email: 'alex@example.com' },
      website: '',
    })

    const bad = await caught(
      client.rescheduleBooking('a'.repeat(43), { start: 'tomorrow' }),
    )
    expect(bad.code).toBe('invalid_request')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
