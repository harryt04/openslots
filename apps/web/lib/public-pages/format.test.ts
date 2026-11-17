import { describe, expect, it } from 'vitest'

import { addMinutes, formatLongDate, formatTimeSpan, zoneName } from './format'

describe('manage page formatting', () => {
  it('formats the date and times in the named zone', () => {
    // 2026-12-03 20:30Z is 1:30 PM in Denver (MST, UTC-7).
    expect(formatLongDate('2026-12-03T20:30:00Z', 'America/Denver')).toBe(
      'Thursday, December 3, 2026',
    )
    expect(
      formatTimeSpan(
        '2026-12-03T20:30:00Z',
        '2026-12-03T21:30:00Z',
        'America/Denver',
      ),
    ).toBe('1:30 – 2:30 PM')
  })

  it('keeps both periods when the span crosses noon', () => {
    expect(
      formatTimeSpan(
        '2026-12-03T18:30:00Z',
        '2026-12-03T19:30:00Z',
        'America/Denver',
      ),
    ).toBe('11:30 AM – 12:30 PM')
  })

  it('uses the day in the zone, not in UTC', () => {
    expect(formatLongDate('2026-12-04T03:00:00Z', 'America/Denver')).toContain(
      'December 3',
    )
  })

  it('names the zone', () => {
    expect(zoneName('2026-12-03T20:30:00Z', 'America/Denver')).toBe(
      'Mountain Time',
    )
  })

  it('adds minutes', () => {
    expect(addMinutes('2026-12-03T20:30:00.000Z', 45)).toBe(
      '2026-12-03T21:15:00.000Z',
    )
  })
})

describe('formatTimeSpan across a clock change', () => {
  it('names the zone on each time when the clocks go back in between', () => {
    // 1 November 2026 in Denver: 1:30 AM happens twice.
    expect(
      formatTimeSpan(
        '2026-11-01T07:30:00Z',
        '2026-11-01T08:30:00Z',
        'America/Denver',
      ),
    ).toBe('1:30 AM MDT – 1:30 AM MST')
  })

  it('stays compact on an ordinary day', () => {
    expect(
      formatTimeSpan(
        '2026-12-03T20:30:00Z',
        '2026-12-03T21:30:00Z',
        'America/Denver',
      ),
    ).toBe('1:30 – 2:30 PM')
  })
})
