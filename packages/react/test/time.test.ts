import { describe, expect, it } from 'vitest'

import { lastWindowMonth } from '../src/time'

describe('lastWindowMonth', () => {
  it('reaches the next month when the window ends on the last day of one', () => {
    // 30 January 2027 in Denver plus 29 days is 28 February 2027, the last
    // day of the month. That afternoon is already 1 March in Tokyo, so the
    // calendar must let a Tokyo customer open March.
    const now = new Date('2027-01-30T19:00:00Z')
    expect(lastWindowMonth('America/Denver', 29, now)).toBe('2027-03')
  })

  it('stays in the month when the window ends well inside it', () => {
    const now = new Date('2027-01-30T19:00:00Z')
    expect(lastWindowMonth('America/Denver', 10, now)).toBe('2027-02')
  })
})
