import type { Schedule, ServiceRules } from '@openslots/core'
import { describe, expect, it } from 'vitest'

import {
  buildPreviewInput,
  computePreview,
  exampleBusyRange,
  formatClock,
  minuteOfDay,
  previewDate,
  rulesFromForm,
} from './preview'

const h = (hour: number) => hour * 60
const day = [{ startMin: h(9), endMin: h(18) }]
/** Monday to Friday, 9:00 to 18:00, America/Denver. */
const salon: Schedule = {
  timezone: 'America/Denver',
  weekly: [[], day, day, day, day, day, []],
  overrides: [],
}
const fullColor: ServiceRules = {
  durationMin: 180,
  bufferBeforeMin: 0,
  bufferAfterMin: 15,
  startIntervalMin: 60,
  minNoticeMin: 0,
  windowDays: 60,
  maxPerDay: 2,
}
// Tuesday 1 December 2026, 10:00 MST.
const tuesday = new Date('2026-12-01T17:00:00Z')

const localStarts = (starts: string[], tz = 'America/Denver') =>
  starts.map((iso) => formatClock(minuteOfDay(iso, tz)))

describe('the S4 preview scenario', () => {
  it('returns 09:00, 14:00 and 15:00 for 180 min + 15 after, hourly, busy 13 to 14', () => {
    const preview = computePreview({
      values: fullColor,
      schedule: salon,
      now: tuesday,
      showExample: true,
    })
    if (preview.kind !== 'day') throw new Error(preview.kind)
    expect(preview.date).toBe('2026-12-02')
    expect(preview.example).toEqual({ startMin: h(13), endMin: h(14) })
    expect(preview.starts).toEqual([
      '2026-12-02T16:00:00.000Z',
      '2026-12-02T21:00:00.000Z',
      '2026-12-02T22:00:00.000Z',
    ])
    expect(localStarts(preview.starts)).toEqual([
      '9:00 AM',
      '2:00 PM',
      '3:00 PM',
    ])
  })

  it('offers every hourly start that fits once the example is switched off', () => {
    const preview = computePreview({
      values: fullColor,
      schedule: salon,
      now: tuesday,
      showExample: false,
    })
    if (preview.kind !== 'day') throw new Error(preview.kind)
    expect(preview.example).toBeNull()
    expect(localStarts(preview.starts)).toEqual([
      '9:00 AM',
      '10:00 AM',
      '11:00 AM',
      '12:00 PM',
      '1:00 PM',
      '2:00 PM',
      '3:00 PM',
    ])
  })
})

describe('buildPreviewInput', () => {
  it('asks the engine for one day with no bookings and the given busy times', () => {
    const busy = [
      {
        start: new Date('2026-12-02T20:00:00Z'),
        end: new Date('2026-12-02T21:00:00Z'),
      },
    ]
    expect(
      buildPreviewInput({
        rules: fullColor,
        schedule: salon,
        date: '2026-12-02',
        now: tuesday,
        busy,
      }),
    ).toEqual({
      service: fullColor,
      schedule: salon,
      busy,
      bookedCountByDate: {},
      range: { from: '2026-12-02', to: '2026-12-02' },
      now: tuesday,
    })
  })
})

describe('rulesFromForm', () => {
  it('accepts valid form values and drops non-rule fields', () => {
    expect(
      rulesFromForm({ ...fullColor, name: 'Full color', color: 'pink' }),
    ).toEqual(fullColor)
  })

  it('rejects what the core schema rejects', () => {
    expect(rulesFromForm({ ...fullColor, durationMin: 7 })).toBeNull()
    expect(rulesFromForm({ ...fullColor, durationMin: 485 })).toBeNull()
    expect(rulesFromForm({ ...fullColor, startIntervalMin: 0 })).toBeNull()
    expect(
      computePreview({
        values: { ...fullColor, durationMin: Number.NaN },
        schedule: salon,
        now: tuesday,
        showExample: true,
      }),
    ).toEqual({ kind: 'invalid' })
  })
})

describe('previewDate', () => {
  it('is the next open day wholly beyond the minimum notice', () => {
    expect(previewDate(salon, tuesday, 0)).toBe('2026-12-02')
    // 24 hours from Tuesday 10:00 is Wednesday 10:00, so Thursday.
    expect(previewDate(salon, tuesday, 1440)).toBe('2026-12-03')
    // Friday: the weekend is closed, so Monday.
    expect(previewDate(salon, new Date('2026-12-04T17:00:00Z'), 0)).toBe(
      '2026-12-07',
    )
  })

  it('honours overrides and returns null when nothing is open', () => {
    const closedWednesday: Schedule = {
      ...salon,
      overrides: [{ date: '2026-12-02', ranges: [] }],
    }
    expect(previewDate(closedWednesday, tuesday, 0)).toBe('2026-12-03')
    const never: Schedule = { ...salon, weekly: [[], [], [], [], [], [], []] }
    expect(previewDate(never, tuesday, 0)).toBeNull()
    expect(
      computePreview({
        values: fullColor,
        schedule: never,
        now: tuesday,
        showExample: true,
      }),
    ).toEqual({ kind: 'closed' })
  })
})

describe('exampleBusyRange', () => {
  it('takes the hour holding the middle of the longest range', () => {
    expect(exampleBusyRange(day)).toEqual({ startMin: h(13), endMin: h(14) })
    expect(exampleBusyRange([{ startMin: h(9), endMin: h(17) }])).toEqual({
      startMin: h(13),
      endMin: h(14),
    })
    expect(
      exampleBusyRange([
        { startMin: h(8), endMin: h(10) },
        { startMin: h(13), endMin: h(19) },
      ]),
    ).toEqual({ startMin: h(16), endMin: h(17) })
    // Clipped to a short range.
    expect(exampleBusyRange([{ startMin: 600, endMin: 630 }])).toEqual({
      startMin: 600,
      endMin: 630,
    })
    expect(exampleBusyRange([])).toBeNull()
  })
})

describe('computePreview and the booking window', () => {
  it('flags a preview day beyond the window, where the engine offers nothing', () => {
    const preview = computePreview({
      values: { ...fullColor, windowDays: 1, minNoticeMin: 1440 },
      schedule: salon,
      now: tuesday,
      showExample: false,
    })
    if (preview.kind !== 'day') throw new Error(preview.kind)
    expect(preview.date).toBe('2026-12-03')
    expect(preview.beyondWindow).toBe(true)
    expect(preview.starts).toEqual([])
  })
})
