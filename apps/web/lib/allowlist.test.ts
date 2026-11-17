import { describe, expect, it } from 'vitest'
import { isEmailAllowed, parseAllowedEmails } from './allowlist'
describe('sign-in allowlist', () => {
  it('normalizes case, whitespace and empty entries', () => {
    expect(parseAllowedEmails(' A@Example.com, ,b@example.com ')).toEqual([
      'a@example.com',
      'b@example.com',
    ])
    expect(isEmailAllowed('A@example.com', ' a@EXAMPLE.com ')).toBe(true)
  })
  it('allows unset configuration but refuses unmatched accounts', () => {
    expect(isEmailAllowed('any@example.com', '')).toBe(true)
    expect(isEmailAllowed('any@example.com', 'owner@example.com')).toBe(false)
    expect(isEmailAllowed('any@example.com', ',')).toBe(false)
  })
})
