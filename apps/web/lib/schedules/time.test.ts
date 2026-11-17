import { describe, expect, it } from 'vitest'

import {
  dateFromLocalDate,
  formatDate,
  formatRange,
  formatRanges,
  formatTime,
  localDateFromDate,
  parseTime,
  timeZoneLabel,
} from './time'

const minutes = (text: string, asEnd = false) => {
  const r = parseTime(text, asEnd)
  return r.ok ? r.minutes : null
}

describe('formatTime', () => {
  it('formats as in the design spec', () => {
    expect(formatTime(540)).toBe('9:00 AM')
    expect(formatTime(750)).toBe('12:30 PM')
    expect(formatTime(810)).toBe('1:30 PM')
    expect(formatTime(0)).toBe('12:00 AM')
    expect(formatTime(1440)).toBe('12:00 AM')
    expect(formatTime(1080)).toBe('6:00 PM')
  })
  it('formats ranges, in order', () => {
    expect(formatRange({ startMin: 540, endMin: 780 })).toBe(
      '9:00 AM – 1:00 PM',
    )
    expect(
      formatRanges([
        { startMin: 810, endMin: 1200 },
        { startMin: 540, endMin: 750 },
      ]),
    ).toBe('9:00 AM – 12:30 PM, 1:30 PM – 8:00 PM')
  })
})

describe('parseTime', () => {
  it('reads 12 and 24 hour forms', () => {
    expect(minutes('9:00 AM')).toBe(540)
    expect(minutes('9am')).toBe(540)
    expect(minutes('9:30 pm')).toBe(21 * 60 + 30)
    expect(minutes('12:30 PM')).toBe(750)
    expect(minutes('12 am')).toBe(0)
    expect(minutes('12 pm')).toBe(720)
    expect(minutes('17:00')).toBe(1020)
    expect(minutes('0930')).toBe(570)
    expect(minutes('9')).toBe(540)
    expect(minutes('noon')).toBe(720)
    expect(minutes('  6:05 P.M. ')).toBe(18 * 60 + 5)
  })
  it('reads midnight as the end of the day for an end time', () => {
    expect(minutes('12:00 AM', true)).toBe(1440)
    expect(minutes('24:00', true)).toBe(1440)
    expect(minutes('12:00 AM', false)).toBe(0)
  })
  it('refuses things that are not times', () => {
    for (const bad of [
      '',
      'abc',
      '25:00',
      '13 pm',
      '0 am',
      '9:60',
      '9:5',
      '9:00 XM',
    ])
      expect(minutes(bad), bad).toBeNull()
  })
  it('round trips every 5 minute step', () => {
    for (let m = 0; m < 1440; m += 5) expect(minutes(formatTime(m))).toBe(m)
  })
})

describe('dates and zones', () => {
  it('formats dates as in the spec', () => {
    expect(formatDate('2026-12-24')).toBe('Thu, Dec 24')
    expect(formatDate('2026-12-25', 2026)).toBe('Fri, Dec 25')
    expect(formatDate('2027-01-01', 2026)).toBe('Fri, Jan 1, 2027')
  })
  it('converts between picker dates and YYYY-MM-DD without shifting', () => {
    expect(localDateFromDate(dateFromLocalDate('2026-03-08'))).toBe(
      '2026-03-08',
    )
    expect(localDateFromDate(dateFromLocalDate('2026-12-31'))).toBe(
      '2026-12-31',
    )
  })
  it('labels a zone readably', () => {
    expect(timeZoneLabel('America/Denver')).toMatch(
      /^America\/Denver \(.*Mountain.*\)$/,
    )
    expect(timeZoneLabel('Not/AZone')).toBe('Not/AZone')
  })
})

describe('review regression: 24:00 is only an end time', () => {
  it('refuses 24:00 as a start instead of turning it into midnight', () => {
    expect(parseTime('24:00', false).ok).toBe(false)
    expect(parseTime('24:00', true)).toEqual({ ok: true, minutes: 1440 })
  })
})
