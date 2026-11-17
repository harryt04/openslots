import { expect, test } from 'vitest'
import { calendarNotice, calendarNoticeCode, calendarNotices } from './notices'

test('URL notices select a fixed message, never arbitrary text or inherited keys', () => {
  for (const code of [
    'attacker supplied notice',
    '__proto__',
    'toString',
    '',
    undefined,
  ]) {
    expect(calendarNotice(code)).toBeUndefined()
  }
  for (const [code, text] of Object.entries(calendarNotices)) {
    expect(calendarNotice(code)).toBe(text)
    expect(calendarNoticeCode(text)).toBe(code)
  }
  expect(calendarNoticeCode('unrecognized server result')).toBeUndefined()
})
