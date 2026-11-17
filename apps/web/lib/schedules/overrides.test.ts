import type { TimeRange } from '@openslots/core'
import { describe, expect, it } from 'vitest'

import { overrideKind, sortOverrides } from './overrides'

const r = (a: number, b: number): TimeRange => ({
  startMin: a * 60,
  endMin: b * 60,
})
const day = [r(9, 17)]
// Sunday closed, Monday to Friday 9 to 5, Saturday closed.
const weekly = [[], day, day, day, day, day, []]

describe('overrideKind', () => {
  it('is closed when there are no ranges', () => {
    expect(overrideKind({ date: '2026-12-25', ranges: [] }, weekly)).toBe(
      'closed',
    )
    expect(overrideKind({ date: '2026-12-26', ranges: [] }, weekly)).toBe(
      'closed',
    )
  })
  it('is a short day when it opens less than usual, inside the usual hours', () => {
    // Thursday 24 December 2026.
    expect(
      overrideKind({ date: '2026-12-24', ranges: [r(9, 13)] }, weekly),
    ).toBe('short-day')
    expect(
      overrideKind(
        { date: '2026-12-24', ranges: [r(9, 11), r(14, 16)] },
        weekly,
      ),
    ).toBe('short-day')
  })
  it('treats a shortened day that spans a lunch gap as a short day', () => {
    const gapped = [[], [], [], [], [r(9, 12.5), r(13.5, 20)], [], []]
    expect(
      overrideKind({ date: '2026-12-24', ranges: [r(9, 13)] }, gapped),
    ).toBe('short-day')
  })
  it('is an extra day when a normally closed weekday is opened', () => {
    // Monday is open; Sunday 27 December and Saturday 26 December are closed.
    expect(
      overrideKind({ date: '2026-12-27', ranges: [r(10, 16)] }, weekly),
    ).toBe('extra-day')
    expect(
      overrideKind({ date: '2026-12-26', ranges: [r(10, 16)] }, weekly),
    ).toBe('extra-day')
  })
  it('is changed hours when it opens outside or beyond the usual hours', () => {
    expect(
      overrideKind({ date: '2026-12-24', ranges: [r(9, 20)] }, weekly),
    ).toBe('changed-hours')
    expect(
      overrideKind({ date: '2026-12-24', ranges: [r(18, 21)] }, weekly),
    ).toBe('changed-hours')
  })
  it('is usual hours when it matches the weekday', () => {
    expect(
      overrideKind({ date: '2026-12-24', ranges: [r(9, 17)] }, weekly),
    ).toBe('usual-hours')
  })
})

describe('sortOverrides', () => {
  it('sorts by date without mutating', () => {
    const input = [{ date: '2026-12-25' }, { date: '2026-01-02' }]
    expect(sortOverrides(input).map((o) => o.date)).toEqual([
      '2026-01-02',
      '2026-12-25',
    ])
    expect(input[0]?.date).toBe('2026-12-25')
  })
})

describe('review regression: usual hours means the same times', () => {
  it('is not usual hours when the same total covers different times', () => {
    const lunchGap = Array.from({ length: 7 }, () => [
      { startMin: 9 * 60, endMin: 12 * 60 },
      { startMin: 13 * 60, endMin: 18 * 60 },
    ])
    expect(
      overrideKind(
        { date: '2026-12-24', ranges: [{ startMin: 9 * 60, endMin: 17 * 60 }] },
        lunchGap,
      ),
    ).not.toBe('usual-hours')
    expect(
      overrideKind(
        {
          date: '2026-12-24',
          ranges: [
            { startMin: 9 * 60, endMin: 12 * 60 },
            { startMin: 13 * 60, endMin: 18 * 60 },
          ],
        },
        lunchGap,
      ),
    ).toBe('usual-hours')
  })
})
