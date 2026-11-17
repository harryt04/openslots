import { describe, expect, it } from 'vitest'

import { parseServiceForm } from './schema'

const valid = {
  name: 'Trim',
  description: '',
  color: 'blue',
  durationMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  startIntervalMin: 30,
  minNoticeMin: 0,
  windowDays: 60,
  scheduleId: '0123456789abcdef01234567',
  askPhone: false,
  askNotes: false,
}

describe('parseServiceForm', () => {
  it('accepts a valid service and leaves the cap optional', () => {
    const parsed = parseServiceForm(valid)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.data).not.toHaveProperty('maxPerDay')
  })

  it('reports plain-language errors per field', () => {
    const parsed = parseServiceForm({
      ...valid,
      name: '   ',
      color: 'red',
      durationMin: 7,
      startIntervalMin: 0,
      windowDays: 400,
      maxPerDay: 0,
      scheduleId: 'nope',
    })
    if (parsed.ok) throw new Error('expected errors')
    expect(parsed.fieldErrors).toEqual({
      name: 'Enter a name.',
      color: 'Choose a color.',
      durationMin: 'Must be a multiple of 5 minutes',
      startIntervalMin: 'The start interval must be at least 5 minutes.',
      windowDays: 'The booking window can be at most 365 days.',
      maxPerDay: 'Allow at least 1 booking a day.',
      scheduleId: 'Choose a schedule.',
    })
  })

  it('caps a custom duration at 8 hours', () => {
    const parsed = parseServiceForm({ ...valid, durationMin: 485 })
    if (parsed.ok) throw new Error('expected errors')
    expect(parsed.fieldErrors.durationMin).toBe(
      'A service can last at most 8 hours.',
    )
  })

  it('ignores slug and active from the client', () => {
    const parsed = parseServiceForm({ ...valid, slug: 'x', active: false })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data).not.toHaveProperty('slug')
      expect(parsed.data).not.toHaveProperty('active')
    }
  })
})
