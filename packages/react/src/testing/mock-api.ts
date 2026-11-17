/**
 * An in-memory stand-in for the public API v1, served through a `fetch`
 * function. For the package's tests and the app's component gallery only;
 * not published.
 *
 * The data is the design spec's salon: Trim (30 min), Cut and style (60) and
 * Full color (180), open Tuesday to Saturday, with the spec's busy pattern
 * and its December 2026 exceptions. Availability comes from the real slot
 * engine in `@openslots/core`; nothing here computes slots itself.
 */
import {
  API_ERROR_STATUS,
  computeSlots,
  createBookingBodySchema,
  eachDate,
  groupSlotsByDate,
  PUBLISHABLE_KEY_HEADER,
  rescheduleBodySchema,
  scheduleRangeFor,
  slotsQuerySchema,
  wallTimeToUtc,
  type ApiErrorCode,
  type BusinessResponse,
  type Interval,
  type ManageSummary,
  type PublicService,
  type Schedule,
  type ServiceRules,
} from '@openslots/core'

export const MOCK_HOST = 'https://slots.example.com'
export const MOCK_KEY = 'os_pk_mockmockmockmockmockmock'

export const MOCK_SERVICES: PublicService[] = [
  {
    id: '64b000000000000000000001',
    name: 'Trim',
    slug: 'trim',
    description: 'Tidy up between cuts.',
    color: 'blue',
    durationMin: 30,
    askPhone: false,
    askNotes: false,
  },
  {
    id: '64b000000000000000000002',
    name: 'Cut and style',
    slug: 'cut-and-style',
    description: 'Wash, cut and blow dry.',
    color: 'orange',
    durationMin: 60,
    askPhone: true,
    askNotes: true,
  },
  {
    id: '64b000000000000000000003',
    name: 'Full color',
    slug: 'full-color',
    description: 'All-over color or balayage.',
    color: 'pink',
    durationMin: 180,
    askPhone: false,
    askNotes: true,
  },
]

const RULES: Record<string, ServiceRules> = {
  trim: rules(30, 0, 30),
  'cut-and-style': rules(60, 10, 30),
  'full-color': rules(180, 15, 60),
}

function rules(durationMin: number, after: number, step: number): ServiceRules {
  return {
    durationMin,
    bufferBeforeMin: 0,
    bufferAfterMin: after,
    startIntervalMin: step,
    minNoticeMin: 60,
    windowDays: 365,
  }
}

export const MOCK_BUSINESS: BusinessResponse = {
  name: 'Shear Bliss Salon',
  slug: 'shear-bliss',
  timezone: 'America/Denver',
  services: MOCK_SERVICES,
}

/** The spec's hours: closed Sunday and Monday, late Thursday, short Saturday. */
const SCHEDULE: Schedule = {
  timezone: 'America/Denver',
  weekly: [
    [],
    [],
    [{ startMin: 540, endMin: 1080 }],
    [{ startMin: 540, endMin: 1080 }],
    [{ startMin: 540, endMin: 1200 }],
    [{ startMin: 540, endMin: 1080 }],
    [{ startMin: 600, endMin: 900 }],
  ],
  overrides: [
    { date: '2026-12-24', ranges: [{ startMin: 540, endMin: 780 }] },
    { date: '2026-12-25', ranges: [] },
    { date: '2026-12-28', ranges: [{ startMin: 600, endMin: 960 }] },
  ],
}

/** The spec's busy pattern, by day of the month, in business wall time. */
function busyOn(date: string): Interval[] {
  const d = Number(date.slice(8, 10))
  const thursday = new Date(`${date}T12:00:00Z`).getUTCDay() === 4
  const ranges: [number, number][] = []
  if (d % 2 === 0) ranges.push([660, 720])
  if (d % 3 === 0) ranges.push([870, 930])
  if (thursday) ranges.push([750, 810])
  if (d % 5 === 0) ranges.push([540, 660])
  return ranges.map(([a, b]) => ({
    start: wallTimeToUtc(date, a, SCHEDULE.timezone, 'later')!,
    end: wallTimeToUtc(date, b, SCHEDULE.timezone, 'later')!,
  }))
}

export type MockScenario =
  | 'loaded'
  /** Every request hangs, to show loading states. */
  | 'loading'
  /** Slots come back empty for every date. */
  | 'no_slots'
  /** Slots are withheld with `reason: 'calendar_unavailable'`. */
  | 'calendar_unavailable'
  /** The next booking attempt gets `409 slot_taken`, and that time is gone. */
  | 'slot_taken'
  /** Booking attempts fail with the given code. */
  | 'booking_rate_limited'
  | 'booking_calendar_unavailable'
  | 'booking_network_error'
  /** `GET /business` fails. */
  | 'business_error'

export interface MockApiOptions {
  scenario?: MockScenario
  /** The clock the slot engine uses. Defaults to the real time. */
  now?: () => Date
  /** Delay before each response, in milliseconds. */
  latencyMs?: number
  host?: string
}

export interface MockCall {
  method: string
  url: URL
  headers: Headers
  body: unknown
}

export interface MockApi {
  fetch: typeof fetch
  calls: MockCall[]
  scenario: MockScenario
  setScenario(scenario: MockScenario): void
  /** Starts that have been booked, as UTC ISO strings. */
  booked: string[]
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function apiError(code: ApiErrorCode, message: string = code): Response {
  return json(API_ERROR_STATUS[code], { error: { code, message } })
}

const TOKEN = 'mock-manage-token-aaaaaaaaaaaaaaaaaaaaaaaaaa'.slice(0, 43)

export function createMockApi(options: MockApiOptions = {}): MockApi {
  const host = options.host ?? MOCK_HOST
  const now = options.now ?? (() => new Date())
  const taken = new Map<string, Interval>()
  let bookingCount = 0

  const api: MockApi = {
    calls: [],
    booked: [],
    scenario: options.scenario ?? 'loaded',
    setScenario(s) {
      api.scenario = s
    },
    fetch: async (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      )
      const headers = new Headers(init?.headers)
      const method = (init?.method ?? 'GET').toUpperCase()
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      api.calls.push({ method, url, headers, body })

      if (api.scenario === 'loading') {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        })
      }
      if (options.latencyMs) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, options.latencyMs)
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return handle(method, url, headers, body)
    },
  }

  function handle(
    method: string,
    url: URL,
    headers: Headers,
    body: unknown,
  ): Response {
    if (headers.get(PUBLISHABLE_KEY_HEADER) !== MOCK_KEY) {
      return apiError('invalid_key', 'Missing or unknown publishable key')
    }
    const path = url.pathname.replace(/^\/api\/v1/, '')

    if (method === 'GET' && path === '/business') {
      if (api.scenario === 'business_error') return apiError('internal_error')
      return json(200, MOCK_BUSINESS)
    }

    if (method === 'GET' && path === '/slots') {
      const query = slotsQuerySchema.safeParse(
        Object.fromEntries(url.searchParams),
      )
      if (!query.success)
        return apiError('invalid_request', query.error.message)
      const service = MOCK_SERVICES.find((s) => s.id === query.data.service)
      if (!service) return apiError('not_found', 'Unknown service')
      const tz = query.data.tz ?? MOCK_BUSINESS.timezone
      if (api.scenario === 'calendar_unavailable') {
        return json(200, {
          timezone: tz,
          days: {},
          reason: 'calendar_unavailable',
        })
      }
      if (api.scenario === 'no_slots')
        return json(200, { timezone: tz, days: {} })
      const range = scheduleRangeFor({
        from: query.data.from,
        to: query.data.to,
      })
      const busy = [
        ...eachDate(range.from, range.to).flatMap(busyOn),
        ...taken.values(),
      ]
      const byScheduleDate = computeSlots({
        service: RULES[service.slug]!,
        schedule: SCHEDULE,
        busy,
        bookedCountByDate: {},
        range,
        now: now(),
      })
      const days = groupSlotsByDate(byScheduleDate, tz, {
        from: query.data.from,
        to: query.data.to,
      })
      return json(200, { timezone: tz, days })
    }

    if (method === 'POST' && path === '/bookings') {
      const parsed = createBookingBodySchema.safeParse(body)
      if (!parsed.success)
        return apiError('invalid_request', parsed.error.message)
      const service = MOCK_SERVICES.find((s) => s.id === parsed.data.serviceId)
      if (!service) return apiError('not_found', 'Unknown service')
      const start = new Date(parsed.data.start)
      const end = new Date(start.getTime() + service.durationMin * 60_000)
      const interval = { start, end }
      if (api.scenario === 'slot_taken') {
        // Someone else got there first: the time is gone from now on.
        taken.set(start.toISOString(), interval)
        api.scenario = 'loaded'
        return apiError('slot_taken', 'That start is no longer open')
      }
      if (api.scenario === 'booking_rate_limited')
        return apiError('rate_limited')
      if (api.scenario === 'booking_calendar_unavailable') {
        return apiError('calendar_unavailable')
      }
      if (api.scenario === 'booking_network_error') {
        throw new TypeError('Failed to fetch')
      }
      if (taken.has(start.toISOString())) return apiError('slot_taken')
      taken.set(start.toISOString(), interval)
      api.booked.push(start.toISOString())
      bookingCount += 1
      return json(201, {
        id: `64c${String(bookingCount).padStart(21, '0')}`,
        start: start.toISOString(),
        end: end.toISOString(),
        manageUrl: `${host}/m/${TOKEN}`,
      })
    }

    const manage = /^\/manage\/([^/]+)(\/cancel|\/reschedule)?$/.exec(path)
    if (manage) {
      if (manage[1] !== TOKEN || !api.booked.length)
        return apiError('not_found')
      const service = MOCK_SERVICES[1]!
      let start = api.booked[api.booked.length - 1]!
      let status: ManageSummary['status'] = 'confirmed'
      if (method === 'POST' && manage[2] === '/cancel') status = 'cancelled'
      if (method === 'POST' && manage[2] === '/reschedule') {
        const parsed = rescheduleBodySchema.safeParse(body)
        if (!parsed.success) return apiError('invalid_request')
        start = new Date(parsed.data.start).toISOString()
      }
      const summary: ManageSummary = {
        id: '64c000000000000000000001',
        status,
        start,
        end: new Date(
          Date.parse(start) + service.durationMin * 60_000,
        ).toISOString(),
        timezone: MOCK_BUSINESS.timezone,
        service: {
          id: service.id,
          name: service.name,
          color: service.color,
          durationMin: service.durationMin,
        },
        business: {
          name: MOCK_BUSINESS.name,
          slug: MOCK_BUSINESS.slug,
          timezone: MOCK_BUSINESS.timezone,
        },
        customer: { name: 'Alex Morgan', email: 'alex@example.com' },
      }
      return json(200, summary)
    }

    return apiError('not_found', `No route for ${method} ${path}`)
  }

  return api
}
