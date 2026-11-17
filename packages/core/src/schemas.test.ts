import { describe, expect, it } from 'vitest'

import {
  API_ERROR_STATUS,
  apiErrorSchema,
  createBookingBodySchema,
  slotsQuerySchema,
  slotsResponseSchema,
} from './api'
import {
  BLOCK_MINUTES,
  customerFieldsSchema,
  DURATION_PRESETS,
  localDateSchema,
  scheduleRulesSchema,
  serviceColorSchema,
  serviceRulesSchema,
  slugSchema,
  timeZoneSchema,
} from './schemas'

const ok = (
  schema: { safeParse: (v: unknown) => { success: boolean } },
  v: unknown,
) => schema.safeParse(v).success

const rules = {
  durationMin: 60,
  bufferBeforeMin: 0,
  bufferAfterMin: 10,
  startIntervalMin: 30,
  minNoticeMin: 120,
  windowDays: 60,
}

describe('service rules', () => {
  it('accepts every duration preset and 5 to 480 in steps of 5', () => {
    for (const d of [...DURATION_PRESETS, 5, 475, 480]) {
      expect(ok(serviceRulesSchema, { ...rules, durationMin: d })).toBe(true)
    }
  })

  it('rejects durations that are off the 5 minute grid or out of range', () => {
    for (const d of [0, 4, 7, 485, 61, 60.5]) {
      expect(ok(serviceRulesSchema, { ...rules, durationMin: d })).toBe(false)
    }
  })

  it('requires buffers and the interval on the 5 minute grid', () => {
    expect(ok(serviceRulesSchema, { ...rules, bufferAfterMin: 7 })).toBe(false)
    expect(ok(serviceRulesSchema, { ...rules, startIntervalMin: 0 })).toBe(
      false,
    )
    expect(ok(serviceRulesSchema, { ...rules, startIntervalMin: 12 })).toBe(
      false,
    )
  })

  it('treats the daily cap as optional and positive', () => {
    expect(ok(serviceRulesSchema, { ...rules, maxPerDay: 2 })).toBe(true)
    expect(ok(serviceRulesSchema, { ...rules, maxPerDay: 0 })).toBe(false)
  })

  it('keeps block alignment at 5 minutes', () => {
    expect(BLOCK_MINUTES).toBe(5)
  })
})

describe('schedule', () => {
  const closed: never[] = []
  const day = [{ startMin: 540, endMin: 1020 }]
  const base = {
    timezone: 'America/Denver',
    weekly: [closed, day, day, day, day, day, closed],
    overrides: [],
  }

  it('accepts weekly hours and overrides, including a closed day', () => {
    expect(
      ok(scheduleRulesSchema, {
        ...base,
        overrides: [{ date: '2026-12-24', ranges: [] }],
      }),
    ).toBe(true)
  })

  it('needs exactly 7 weekly entries', () => {
    expect(
      ok(scheduleRulesSchema, { ...base, weekly: base.weekly.slice(1) }),
    ).toBe(false)
  })

  it('rejects overlapping ranges but allows touching ones', () => {
    const touch = [
      { startMin: 540, endMin: 720 },
      { startMin: 720, endMin: 1020 },
    ]
    const overlap = [
      { startMin: 540, endMin: 730 },
      { startMin: 720, endMin: 1020 },
    ]
    expect(
      ok(scheduleRulesSchema, { ...base, weekly: Array(7).fill(touch) }),
    ).toBe(true)
    expect(
      ok(scheduleRulesSchema, { ...base, weekly: Array(7).fill(overlap) }),
    ).toBe(false)
  })

  it('rejects a range that ends before it starts or leaves the day', () => {
    const bad = [
      [{ startMin: 600, endMin: 600 }],
      [{ startMin: 0, endMin: 1445 }],
    ]
    for (const ranges of bad) {
      expect(
        ok(scheduleRulesSchema, { ...base, weekly: Array(7).fill(ranges) }),
      ).toBe(false)
    }
  })

  it('rejects two overrides for one date and impossible dates', () => {
    const o = { date: '2026-12-24', ranges: [] }
    expect(ok(scheduleRulesSchema, { ...base, overrides: [o, o] })).toBe(false)
    expect(ok(localDateSchema, '2026-02-29')).toBe(false)
    expect(ok(localDateSchema, '2028-02-29')).toBe(true)
    expect(ok(localDateSchema, '2026-1-05')).toBe(false)
  })
})

describe('primitives', () => {
  it('accepts IANA timezones and rejects offsets and junk', () => {
    for (const tz of [
      'America/Denver',
      'Europe/London',
      'UTC',
      'America/Argentina/Buenos_Aires',
    ]) {
      expect(ok(timeZoneSchema, tz)).toBe(true)
    }
    for (const tz of ['+01:00', 'Mars/Olympus', '', 'denver']) {
      expect(ok(timeZoneSchema, tz)).toBe(false)
    }
  })

  it('accepts URL slugs only', () => {
    expect(ok(slugSchema, 'cut-and-style')).toBe(true)
    for (const s of ['Cut', 'a--b', '-a', 'a b', ''])
      expect(ok(slugSchema, s)).toBe(false)
  })

  it('names the six service colors', () => {
    expect(serviceColorSchema.options).toEqual([
      'blue',
      'orange',
      'sky',
      'vermillion',
      'pink',
      'yellow',
    ])
  })

  it('limits customer fields', () => {
    const c = { name: 'Priya Nair', email: 'priya@example.com' }
    expect(ok(customerFieldsSchema, c)).toBe(true)
    expect(ok(customerFieldsSchema, { ...c, name: '   ' })).toBe(false)
    expect(ok(customerFieldsSchema, { ...c, name: 'x'.repeat(101) })).toBe(
      false,
    )
    expect(ok(customerFieldsSchema, { ...c, email: 'nope' })).toBe(false)
    expect(ok(customerFieldsSchema, { ...c, notes: 'x'.repeat(1001) })).toBe(
      false,
    )
    expect(ok(customerFieldsSchema, { ...c, phone: '+1 303 555 0100' })).toBe(
      true,
    )
  })
})

describe('public API v1 payloads', () => {
  const service = '0123456789abcdef01234567'

  it('limits a slots query to 62 days, forwards only', () => {
    expect(
      ok(slotsQuerySchema, { service, from: '2026-12-01', to: '2027-02-01' }),
    ).toBe(true)
    expect(
      ok(slotsQuerySchema, { service, from: '2026-12-01', to: '2027-02-02' }),
    ).toBe(false)
    expect(
      ok(slotsQuerySchema, { service, from: '2026-12-02', to: '2026-12-01' }),
    ).toBe(false)
    expect(
      ok(slotsQuerySchema, {
        service,
        from: '2026-12-01',
        to: '2026-12-01',
        tz: 'Asia/Tokyo',
      }),
    ).toBe(true)
  })

  it('parses a slots response grouped by date', () => {
    expect(
      ok(slotsResponseSchema, {
        timezone: 'America/Denver',
        days: { '2026-12-02': ['2026-12-02T16:00:00.000Z'] },
      }),
    ).toBe(true)
    expect(
      ok(slotsResponseSchema, {
        timezone: 'America/Denver',
        days: {},
        reason: 'calendar_unavailable',
      }),
    ).toBe(true)
  })

  it('validates a create-booking body', () => {
    const body = {
      serviceId: service,
      start: '2026-12-02T16:00:00Z',
      timezone: 'America/Denver',
      customer: { name: 'Priya Nair', email: 'priya@example.com' },
    }
    expect(ok(createBookingBodySchema, body)).toBe(true)
    expect(
      ok(createBookingBodySchema, {
        ...body,
        start: '2026-12-02T09:00:00-07:00',
      }),
    ).toBe(true)
    expect(
      ok(createBookingBodySchema, { ...body, start: '2026-12-02 09:00' }),
    ).toBe(false)
  })

  it('names the error codes the TRD uses, with their statuses', () => {
    expect(API_ERROR_STATUS.slot_taken).toBe(409)
    expect(API_ERROR_STATUS.calendar_unavailable).toBe(502)
    expect(
      ok(apiErrorSchema, { error: { code: 'slot_taken', message: 'Taken' } }),
    ).toBe(true)
    expect(
      ok(apiErrorSchema, { error: { code: 'teapot', message: 'x' } }),
    ).toBe(false)
  })
})

describe('review regressions', () => {
  it('reports invalid slot dates as validation errors instead of throwing', async () => {
    const { slotsQuerySchema } = await import('./api')
    const service = '0123456789abcdef01234567'
    for (const bad of ['2026-02-29', 'garbage', '2026-13-01']) {
      expect(
        slotsQuerySchema.safeParse({ service, from: bad, to: '2026-12-02' })
          .success,
      ).toBe(false)
      expect(
        slotsQuerySchema.safeParse({ service, from: '2026-12-02', to: bad })
          .success,
      ).toBe(false)
    }
  })

  it('treats blank optional customer fields as not given', () => {
    const parsed = customerFieldsSchema.parse({
      name: 'A',
      email: 'a@example.com',
      phone: '',
      notes: '   ',
    })
    expect(parsed.phone).toBeUndefined()
    expect(parsed.notes).toBeUndefined()
    expect(
      customerFieldsSchema.parse({
        name: 'A',
        email: 'a@example.com',
        phone: ' 555 ',
      }).phone,
    ).toBe('555')
  })
})
