import { describe, expect, it } from 'vitest'

import { isFakeGoogle, requireEnv } from './env'

describe('isFakeGoogle', () => {
  it('is off unless E2E_FAKE_GOOGLE is exactly 1', () => {
    expect(isFakeGoogle({})).toBe(false)
    expect(isFakeGoogle({ E2E_FAKE_GOOGLE: 'true' })).toBe(false)
    expect(isFakeGoogle({ E2E_FAKE_GOOGLE: '0' })).toBe(false)
  })

  it('is on in development and test', () => {
    expect(isFakeGoogle({ E2E_FAKE_GOOGLE: '1', NODE_ENV: 'test' })).toBe(true)
    expect(
      isFakeGoogle({ E2E_FAKE_GOOGLE: '1', NODE_ENV: 'development' }),
    ).toBe(true)
  })

  it('refuses to turn on in production', () => {
    expect(() =>
      isFakeGoogle({ E2E_FAKE_GOOGLE: '1', NODE_ENV: 'production' }),
    ).toThrow(/must not be set/)
  })
})

describe('requireEnv', () => {
  it('returns the value or names the missing variable', () => {
    expect(requireEnv('A', { A: 'x' })).toBe('x')
    expect(() => requireEnv('A', {})).toThrow(/^A environment variable/)
  })
})
