import { describe, expect, it } from 'vitest'

import type { Interval, Schedule, ServiceRules, TimeRange } from './schemas'
import { computeSlots, groupSlotsByDate, type ComputeSlotsInput } from './slots'

const h = (hour: number, minute = 0) => hour * 60 + minute
const r = (start: number, end: number): TimeRange => ({
  startMin: start,
  endMin: end,
})
const iso = (s: string) => new Date(s).toISOString()
const at = (s: string) => new Date(s)
const busy = (start: string, end: string): Interval => ({
  start: at(start),
  end: at(end),
})

const service = (over: Partial<ServiceRules> = {}): ServiceRules => ({
  durationMin: 60,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  startIntervalMin: 60,
  minNoticeMin: 0,
  windowDays: 365,
  ...over,
})

/** The same ranges every day of the week. */
const everyDay = (
  timezone: string,
  ranges: TimeRange[],
  overrides: Schedule['overrides'] = [],
): Schedule => ({
  timezone,
  weekly: [ranges, ranges, ranges, ranges, ranges, ranges, ranges],
  overrides,
})

/** Monday to Friday only. */
const weekdays = (
  timezone: string,
  ranges: TimeRange[],
  overrides: Schedule['overrides'] = [],
): Schedule => ({
  timezone,
  weekly: [[], ranges, ranges, ranges, ranges, ranges, []],
  overrides,
})

const run = (over: Partial<ComputeSlotsInput> & { date: string }) => {
  const { date, ...rest } = over
  return computeSlots({
    service: service(),
    schedule: everyDay('America/Denver', [r(h(9), h(17))]),
    busy: [],
    bookedCountByDate: {},
    range: { from: date, to: date },
    now: at('2026-01-01T00:00:00Z'),
    ...rest,
  })
}

describe('computeSlots: the S4 preview scenario', () => {
  // Wednesday 2 December 2026, America/Denver (MST, UTC-7). Open 9:00 to
  // 18:00, busy 13:00 to 14:00, a 180 minute service with a 15 minute buffer
  // after, starting every 60 minutes.
  const result = computeSlots({
    service: service({
      durationMin: 180,
      bufferAfterMin: 15,
      startIntervalMin: 60,
    }),
    schedule: weekdays('America/Denver', [r(h(9), h(18))]),
    busy: [busy('2026-12-02T20:00:00Z', '2026-12-02T21:00:00Z')],
    bookedCountByDate: {},
    range: { from: '2026-12-02', to: '2026-12-02' },
    now: at('2026-11-16T12:00:00Z'),
  })

  it('offers 09:00, 14:00 and 15:00 local', () => {
    // 15:00 ends exactly at 18:00; its buffer runs past closing, which is allowed.
    // 10:00 to 13:00 starts all overlap the busy hour once the buffer is added.
    expect(result).toEqual({
      '2026-12-02': [
        iso('2026-12-02T16:00:00Z'),
        iso('2026-12-02T21:00:00Z'),
        iso('2026-12-02T22:00:00Z'),
      ],
    })
  })

  it('drops 10:00 only because of the buffer reaching the busy block', () => {
    // 10:00 + 180 = 13:00, touching busy; + 15 buffer overlaps it.
    const noBuffer = computeSlots({
      service: service({ durationMin: 180, startIntervalMin: 60 }),
      schedule: weekdays('America/Denver', [r(h(9), h(18))]),
      busy: [busy('2026-12-02T20:00:00Z', '2026-12-02T21:00:00Z')],
      bookedCountByDate: {},
      range: { from: '2026-12-02', to: '2026-12-02' },
      now: at('2026-11-16T12:00:00Z'),
    })
    expect(noBuffer['2026-12-02']).toContain(iso('2026-12-02T17:00:00Z'))
  })
})

describe('computeSlots: daylight saving in America/Denver', () => {
  it('skips the nonexistent 02:00 on spring-forward day (8 March 2026)', () => {
    const result = run({
      date: '2026-03-08',
      schedule: everyDay('America/Denver', [r(h(0), h(6))]),
    })
    expect(result['2026-03-08']).toEqual([
      iso('2026-03-08T07:00:00Z'), // 00:00 MST
      iso('2026-03-08T08:00:00Z'), // 01:00 MST
      // 02:00 does not exist
      iso('2026-03-08T09:00:00Z'), // 03:00 MDT
      iso('2026-03-08T10:00:00Z'), // 04:00 MDT
      iso('2026-03-08T11:00:00Z'), // 05:00 MDT, ends 06:00 MDT
    ])
  })

  it('uses wall-clock hours on a normal working day after the change', () => {
    const result = run({ date: '2026-03-08' })
    expect(result['2026-03-08']?.[0]).toBe(iso('2026-03-08T15:00:00Z'))
    expect(result['2026-03-08']).toHaveLength(8)
  })

  it('offers the repeated 01:00 once, at its first occurrence, on fall-back day (1 November 2026)', () => {
    const result = run({
      date: '2026-11-01',
      schedule: everyDay('America/Denver', [r(h(0), h(4))]),
    })
    expect(result['2026-11-01']).toEqual([
      iso('2026-11-01T06:00:00Z'), // 00:00 MDT
      iso('2026-11-01T07:00:00Z'), // 01:00 MDT (first 01:00)
      iso('2026-11-01T09:00:00Z'), // 02:00 MST
      iso('2026-11-01T10:00:00Z'), // 03:00 MST, ends 04:00 MST
    ])
  })

  it('lets a service run through the extra hour when the range end is in wall-clock time', () => {
    // 00:00 to 02:00 wall clock is three real hours on fall-back day.
    const result = run({
      date: '2026-11-01',
      service: service({ durationMin: 180 }),
      schedule: everyDay('America/Denver', [r(h(0), h(2))]),
    })
    expect(result['2026-11-01']).toEqual([iso('2026-11-01T06:00:00Z')])
  })
})

describe('computeSlots: daylight saving in Europe/London', () => {
  it('skips 01:00 and 01:30 on spring-forward day (29 March 2026)', () => {
    const result = run({
      date: '2026-03-29',
      service: service({ durationMin: 30, startIntervalMin: 30 }),
      schedule: everyDay('Europe/London', [r(h(0), h(3))]),
    })
    expect(result['2026-03-29']).toEqual([
      iso('2026-03-29T00:00:00Z'), // 00:00 GMT
      iso('2026-03-29T00:30:00Z'), // 00:30 GMT
      iso('2026-03-29T01:00:00Z'), // 02:00 BST
      iso('2026-03-29T01:30:00Z'), // 02:30 BST, ends 03:00 BST
    ])
  })

  it('keys a start before midnight UTC by its London date on fall-back day (25 October 2026)', () => {
    const result = run({
      date: '2026-10-25',
      schedule: everyDay('Europe/London', [r(h(0), h(3))]),
    })
    expect(result).toEqual({
      '2026-10-25': [
        iso('2026-10-24T23:00:00Z'), // 00:00 BST
        iso('2026-10-25T00:00:00Z'), // 01:00 BST (first 01:00)
        iso('2026-10-25T02:00:00Z'), // 02:00 GMT, ends 03:00 GMT
      ],
    })
  })

  it('handles a normal day either side of the change', () => {
    const result = computeSlots({
      service: service(),
      schedule: everyDay('Europe/London', [r(h(9), h(10))]),
      busy: [],
      bookedCountByDate: {},
      range: { from: '2026-10-24', to: '2026-10-26' },
      now: at('2026-01-01T00:00:00Z'),
    })
    expect(result).toEqual({
      '2026-10-24': [iso('2026-10-24T08:00:00Z')],
      '2026-10-25': [iso('2026-10-25T09:00:00Z')],
      '2026-10-26': [iso('2026-10-26T09:00:00Z')],
    })
  })
})

describe('computeSlots: ranges and overrides', () => {
  it('uses every range in a day and never spans the gap between them', () => {
    const result = run({
      date: '2026-12-02',
      schedule: everyDay('America/Denver', [r(h(13), h(17)), r(h(9), h(12))]),
    })
    expect(result['2026-12-02']).toEqual(
      [9, 10, 11, 13, 14, 15, 16].map((hr) =>
        iso(`2026-12-02T${String(hr + 7).padStart(2, '0')}:00:00Z`),
      ),
    )
    const long = run({
      date: '2026-12-02',
      service: service({ durationMin: 90, startIntervalMin: 30 }),
      schedule: everyDay('America/Denver', [r(h(9), h(12)), r(h(13), h(17))]),
    })
    // 10:30 + 90 = 12:00 fits; 11:00 would end in the gap.
    expect(long['2026-12-02']).toContain(iso('2026-12-02T17:30:00Z'))
    expect(long['2026-12-02']).not.toContain(iso('2026-12-02T18:00:00Z'))
  })

  it('closes a day with an empty override', () => {
    const result = run({
      date: '2026-12-02',
      schedule: weekdays(
        'America/Denver',
        [r(h(9), h(17))],
        [{ date: '2026-12-02', ranges: [] }],
      ),
    })
    expect(result).toEqual({ '2026-12-02': [] })
  })

  it('shortens a day with an override', () => {
    const result = run({
      date: '2026-12-02',
      schedule: weekdays(
        'America/Denver',
        [r(h(9), h(17))],
        [{ date: '2026-12-02', ranges: [r(h(9), h(11))] }],
      ),
    })
    expect(result['2026-12-02']).toEqual([
      iso('2026-12-02T16:00:00Z'),
      iso('2026-12-02T17:00:00Z'),
    ])
  })

  it('opens a normally closed day with an override', () => {
    // Sunday 6 December 2026.
    const schedule = weekdays(
      'America/Denver',
      [r(h(9), h(17))],
      [{ date: '2026-12-06', ranges: [r(h(10), h(12))] }],
    )
    expect(run({ date: '2026-12-06', schedule })['2026-12-06']).toEqual([
      iso('2026-12-06T17:00:00Z'),
      iso('2026-12-06T18:00:00Z'),
    ])
    expect(run({ date: '2026-12-13', schedule })['2026-12-13']).toEqual([])
  })

  it('accepts a range that ends at midnight', () => {
    const result = run({
      date: '2026-12-02',
      schedule: everyDay('America/Denver', [r(h(22), 1440)]),
    })
    expect(result['2026-12-02']).toEqual([
      iso('2026-12-03T05:00:00Z'),
      iso('2026-12-03T06:00:00Z'),
    ])
  })
})

describe('computeSlots: buffers and busy times', () => {
  const schedule = everyDay('America/Denver', [r(h(9), h(12))])

  it('drops a start whose buffer before overlaps busy time', () => {
    const result = run({
      date: '2026-12-02',
      schedule,
      service: service({ bufferBeforeMin: 15 }),
      busy: [busy('2026-12-02T16:00:00Z', '2026-12-02T16:50:00Z')], // 9:00–9:50
    })
    // 10:00 needs 9:45–11:00 free; 11:00 needs 10:45–12:00.
    expect(result['2026-12-02']).toEqual([iso('2026-12-02T18:00:00Z')])
  })

  it('keeps a start whose buffer only touches busy time', () => {
    const result = run({
      date: '2026-12-02',
      schedule,
      service: service({ bufferBeforeMin: 15 }),
      busy: [busy('2026-12-02T16:00:00Z', '2026-12-02T16:45:00Z')], // 9:00–9:45
    })
    expect(result['2026-12-02']).toEqual([
      iso('2026-12-02T17:00:00Z'),
      iso('2026-12-02T18:00:00Z'),
    ])
  })

  it('lets buffers extend outside working hours', () => {
    const result = run({
      date: '2026-12-02',
      schedule,
      service: service({ bufferBeforeMin: 30, bufferAfterMin: 30 }),
    })
    expect(result['2026-12-02']).toEqual([
      iso('2026-12-02T16:00:00Z'),
      iso('2026-12-02T17:00:00Z'),
      iso('2026-12-02T18:00:00Z'),
    ])
  })

  it('drops a start whose buffer after reaches busy time outside working hours', () => {
    const result = run({
      date: '2026-12-02',
      schedule,
      service: service({ bufferAfterMin: 30 }),
      busy: [busy('2026-12-02T19:15:00Z', '2026-12-02T20:00:00Z')], // 12:15–13:00
    })
    expect(result['2026-12-02']).not.toContain(iso('2026-12-02T18:00:00Z'))
    expect(result['2026-12-02']).toHaveLength(2)
  })
})

describe('computeSlots: a 180 minute service starting hourly (S4-2)', () => {
  it('offers every hour that leaves room to finish', () => {
    const result = run({
      date: '2026-12-02',
      service: service({ durationMin: 180, startIntervalMin: 60 }),
      schedule: everyDay('America/Denver', [r(h(9), h(18))]),
    })
    expect(result['2026-12-02']).toEqual(
      [9, 10, 11, 12, 13, 14, 15].map((hr) =>
        iso(`2026-12-02T${String(hr + 7).padStart(2, '0')}:00:00Z`),
      ),
    )
  })
})

describe('computeSlots: notice, window and daily cap', () => {
  it('drops starts inside the minimum notice, keeping one exactly at it', () => {
    const result = run({
      date: '2026-12-02',
      service: service({ minNoticeMin: 90 }),
      now: at('2026-12-02T16:30:00Z'), // 9:30 local; earliest 11:00
    })
    expect(result['2026-12-02']?.[0]).toBe(iso('2026-12-02T18:00:00Z'))
  })

  it('drops dates beyond now + windowDays in the schedule timezone', () => {
    const result = computeSlots({
      service: service({ windowDays: 2 }),
      schedule: everyDay('America/Denver', [r(h(9), h(10))]),
      busy: [],
      bookedCountByDate: {},
      range: { from: '2026-12-02', to: '2026-12-05' },
      // 3 December 01:00 UTC is still 2 December in Denver.
      now: at('2026-12-03T01:00:00Z'),
    })
    expect(result).toEqual({
      '2026-12-02': [],
      '2026-12-03': [iso('2026-12-03T16:00:00Z')],
      '2026-12-04': [iso('2026-12-04T16:00:00Z')],
      '2026-12-05': [],
    })
  })

  it('drops every start on a date that has reached maxPerDay', () => {
    const result = computeSlots({
      service: service({ maxPerDay: 2 }),
      schedule: everyDay('America/Denver', [r(h(9), h(11))]),
      busy: [],
      bookedCountByDate: { '2026-12-02': 2, '2026-12-03': 1 },
      range: { from: '2026-12-02', to: '2026-12-03' },
      now: at('2026-01-01T00:00:00Z'),
    })
    expect(result).toEqual({
      '2026-12-02': [],
      '2026-12-03': [iso('2026-12-03T16:00:00Z'), iso('2026-12-03T17:00:00Z')],
    })
  })

  it('ignores booked counts when there is no daily cap', () => {
    const result = run({
      date: '2026-12-02',
      bookedCountByDate: { '2026-12-02': 50 },
    })
    expect(result['2026-12-02']).toHaveLength(8)
  })

  it('returns a key for every date in range and nothing outside it', () => {
    const result = computeSlots({
      service: service(),
      schedule: weekdays('America/Denver', [r(h(9), h(10))]),
      busy: [],
      bookedCountByDate: {},
      range: { from: '2026-12-04', to: '2026-12-07' },
      now: at('2026-01-01T00:00:00Z'),
    })
    expect(Object.keys(result)).toEqual([
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
      '2026-12-07',
    ])
    expect(result['2026-12-05']).toEqual([])
  })

  it('does not read the clock', () => {
    const input = {
      service: service({ minNoticeMin: 60 }),
      schedule: everyDay('America/Denver', [r(h(9), h(17))]),
      busy: [],
      bookedCountByDate: {},
      range: { from: '2030-01-02', to: '2030-01-02' },
      now: at('2030-01-02T15:00:00Z'),
    }
    expect(computeSlots(input)).toEqual(computeSlots(input))
    expect(computeSlots(input)['2030-01-02']?.[0]).toBe(
      iso('2030-01-02T16:00:00Z'),
    )
  })
})

describe('groupSlotsByDate: a customer timezone a day ahead of the business', () => {
  const slots = computeSlots({
    service: service(),
    schedule: everyDay('America/Denver', [r(h(9), h(18))]),
    busy: [],
    bookedCountByDate: {},
    range: { from: '2026-12-02', to: '2026-12-03' },
    now: at('2026-01-01T00:00:00Z'),
  })

  it('moves a whole Denver day to the next date in Asia/Tokyo', () => {
    // 9:00 MST = 16:00 UTC = 01:00 next day in Tokyo (UTC+9).
    const grouped = groupSlotsByDate(slots, 'Asia/Tokyo')
    expect(Object.keys(grouped)).toEqual(['2026-12-03', '2026-12-04'])
    expect(grouped['2026-12-03']).toEqual(slots['2026-12-02'])
    expect(grouped['2026-12-04']).toEqual(slots['2026-12-03'])
  })

  it('splits a Denver day across two UTC dates', () => {
    // 17:00 MST is 00:00 UTC the next day.
    const grouped = groupSlotsByDate(slots, 'UTC')
    expect(grouped['2026-12-02']).toHaveLength(8)
    expect(grouped['2026-12-03']?.[0]).toBe(iso('2026-12-03T00:00:00Z'))
  })

  it('trims to the customer range', () => {
    const grouped = groupSlotsByDate(slots, 'Asia/Tokyo', {
      from: '2026-12-04',
      to: '2026-12-04',
    })
    expect(Object.keys(grouped)).toEqual(['2026-12-04'])
  })

  it('leaves out dates with no slots', () => {
    expect(groupSlotsByDate({ '2026-12-02': [] }, 'UTC')).toEqual({})
  })
})
