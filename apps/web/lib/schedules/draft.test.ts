import { describe, expect, it } from 'vitest'

import {
  draftToInput,
  isDirty,
  nextRange,
  toDraft,
  validateDraft,
  validateOverrideDraft,
  type SavedSchedule,
} from './draft'
import { defaultWeekly } from './defaults'

const saved = (): SavedSchedule => ({
  name: 'Salon hours',
  timezone: 'America/Denver',
  weekly: defaultWeekly(),
  overrides: [{ date: '2026-12-25', ranges: [] }],
})

describe('range validation through the shared schema', () => {
  it('accepts a lunch gap as two ranges', () => {
    const d = toDraft(saved())
    d.weekly[4] = [
      { start: '9:00 AM', end: '12:30 PM' },
      { start: '1:30 PM', end: '8:00 PM' },
    ]
    const { result, errors } = validateDraft(d)
    expect(errors).toEqual({})
    expect(result.ok && result.data.weekly[4]).toEqual([
      { startMin: 540, endMin: 750 },
      { startMin: 810, endMin: 1200 },
    ])
  })
  it('rejects an end that is not after the start, beside the range', () => {
    const d = toDraft(saved())
    d.weekly[2] = [{ start: '5:00 PM', end: '9:00 AM' }]
    expect(validateDraft(d).errors['weekly.2.0.endMin']).toBe(
      'End time must be after start time',
    )
  })
  it('rejects overlapping ranges on the day', () => {
    const d = toDraft(saved())
    d.weekly[3] = [
      { start: '9:00 AM', end: '1:00 PM' },
      { start: '12:00 PM', end: '5:00 PM' },
    ]
    expect(validateDraft(d).errors['weekly.3']).toBe('Time ranges overlap')
  })
  it('lets ranges touch', () => {
    const d = toDraft(saved())
    d.weekly[3] = [
      { start: '9:00 AM', end: '12:00 PM' },
      { start: '12:00 PM', end: '5:00 PM' },
    ]
    expect(validateDraft(d).errors).toEqual({})
  })
  it('refuses a time that is not on the 5 minute grid', () => {
    const d = toDraft(saved())
    d.weekly[1] = [{ start: '9:03 AM', end: '5:00 PM' }]
    expect(validateDraft(d).errors['weekly.1.0.startMin']).toMatch(/5 minutes/)
  })
  it('reports unreadable text under its own key and does not save it', () => {
    const d = toDraft(saved())
    d.weekly[1] = [{ start: 'soon', end: '5:00 PM' }]
    const { result, errors } = validateDraft(d)
    expect(result.ok).toBe(false)
    expect(errors['weekly.1.0.startMin']).toMatch(/Enter a time/)
  })
  it('allows an end at midnight', () => {
    const d = toDraft(saved())
    d.weekly[5] = [{ start: '6:00 PM', end: '12:00 AM' }]
    const { result } = validateDraft(d)
    expect(result.ok && result.data.weekly[5]).toEqual([
      { startMin: 1080, endMin: 1440 },
    ])
  })
  it('refuses duplicate override dates and a blank name', () => {
    const d = toDraft(saved())
    d.overrides.push({ date: '2026-12-25', ranges: [] })
    d.name = '  '
    const { errors } = validateDraft(d)
    expect(errors.overrides).toBe('Each date can have only one override')
    expect(errors.name).toBeDefined()
  })
})

describe('override dialog validation', () => {
  it('needs a date', () => {
    expect(validateOverrideDraft(null, true, []).errors.date).toBe(
      'Pick a date.',
    )
  })
  it('closed all day gives no ranges', () => {
    expect(validateOverrideDraft('2026-12-25', true, []).override).toEqual({
      date: '2026-12-25',
      ranges: [],
    })
  })
  it('needs a range when open, and reports overlaps', () => {
    expect(
      validateOverrideDraft('2026-12-25', false, []).errors.ranges,
    ).toBeDefined()
    const overlap = validateOverrideDraft('2026-12-25', false, [
      { start: '9:00 AM', end: '1:00 PM' },
      { start: '12:00 PM', end: '2:00 PM' },
    ])
    expect(overlap.errors.ranges).toBe('Time ranges overlap')
    expect(overlap.override).toBeUndefined()
  })
})

describe('draft helpers', () => {
  it('round trips a saved schedule and is not dirty', () => {
    const s = saved()
    expect(isDirty(toDraft(s), s)).toBe(false)
    expect(draftToInput(toDraft(s)).input).toEqual(s)
  })
  it('is dirty after an edit or unreadable text, but not after a reorder', () => {
    const s = saved()
    const d = toDraft(s)
    d.timezone = 'Europe/London'
    expect(isDirty(d, s)).toBe(true)
    const d2 = toDraft(s)
    d2.weekly[1] = [{ start: '??', end: '5:00 PM' }]
    expect(isDirty(d2, s)).toBe(true)
    const s3 = saved()
    s3.weekly[1] = [
      { startMin: 540, endMin: 600 },
      { startMin: 660, endMin: 720 },
    ]
    const d3 = toDraft(s3)
    d3.weekly[1] = [...d3.weekly[1]!].reverse()
    expect(isDirty(d3, s3)).toBe(false)
  })
  it('suggests the next range after the last', () => {
    expect(nextRange([])).toEqual({ start: '9:00 AM', end: '10:00 AM' })
    expect(nextRange([{ start: '9:00 AM', end: '12:30 PM' }])).toEqual({
      start: '1:30 PM',
      end: '2:30 PM',
    })
    expect(nextRange([{ start: '9:00 AM', end: '11:30 PM' }]).start).toBe(
      '10:00 PM',
    )
  })
})
