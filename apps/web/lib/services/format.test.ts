import { describe, expect, it } from 'vitest'

import { formatMinutes, openDaysSummary, ruleSummary } from './format'

const rules = (over: Partial<Parameters<typeof ruleSummary>[0]> = {}) => ({
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  startIntervalMin: 30,
  minNoticeMin: 0,
  ...over,
})

describe('ruleSummary', () => {
  it('shows only the parts that apply', () => {
    expect(ruleSummary(rules())).toBe('starts every 30 min')
    expect(
      ruleSummary(rules({ bufferAfterMin: 10, minNoticeMin: 24 * 60 })),
    ).toBe('10 min buffer after · starts every 30 min · 24 hr notice')
  })

  it('matches the spec’s salon services', () => {
    expect(ruleSummary(rules({ minNoticeMin: 120 }))).toBe(
      'starts every 30 min · 2 hr notice',
    )
    expect(
      ruleSummary(
        rules({
          bufferAfterMin: 15,
          startIntervalMin: 60,
          maxPerDay: 2,
          minNoticeMin: 1440,
        }),
      ),
    ).toBe(
      '15 min buffer after · starts every 60 min · max 2 per day · 24 hr notice',
    )
  })

  it('names buffers before, after, or both', () => {
    expect(ruleSummary(rules({ bufferBeforeMin: 5 }))).toBe(
      '5 min buffer before · starts every 30 min',
    )
    expect(ruleSummary(rules({ bufferBeforeMin: 5, bufferAfterMin: 15 }))).toBe(
      '5 min buffer before · 15 min buffer after · starts every 30 min',
    )
    expect(
      ruleSummary(rules({ bufferBeforeMin: 10, bufferAfterMin: 10 })),
    ).toBe('10 min buffer before and after · starts every 30 min')
  })
})

describe('formatMinutes', () => {
  it('uses hours and weeks only when they are whole', () => {
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(90)).toBe('90 min')
    expect(formatMinutes(60)).toBe('1 hr')
    expect(formatMinutes(1440)).toBe('24 hr')
    expect(formatMinutes(10_080)).toBe('1 week')
    expect(formatMinutes(20_160)).toBe('2 weeks')
  })
})

describe('openDaysSummary', () => {
  const r = [{ startMin: 540, endMin: 1020 }]
  it('shortens runs of days, Monday first', () => {
    expect(openDaysSummary([[], r, r, r, r, r, []])).toBe('Mon to Fri')
    expect(openDaysSummary([[], [], r, r, r, r, r])).toBe('Tue to Sat')
    expect(openDaysSummary([[], r, [], r, [], r, []])).toBe('Mon, Wed, Fri')
    expect(openDaysSummary([r, r, r, r, r, r, r])).toBe('Every day')
    expect(openDaysSummary([r, [], [], [], [], r, r])).toBe('Fri to Sun')
    expect(openDaysSummary([[], [], [], [], [], [], []])).toBe(
      'Closed every day',
    )
  })
})
