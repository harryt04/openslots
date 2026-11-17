import { it, expect } from 'vitest'
import { generateManageToken, tokenHash, validOrigin } from './security'
it('tokens are random 32-byte base64url and hash deterministically', () => {
  const token = generateManageToken()
  expect(token).toMatch(/^[\w-]{43}$/)
  expect(generateManageToken()).not.toBe(token)
  expect(tokenHash(token)).toMatch(/^[a-f0-9]{64}$/)
  expect(tokenHash(token)).toBe(tokenHash(token))
})
it('accepts origins, never paths, credentials, null or remote HTTP', () => {
  for (const s of [
    'https://example.com',
    'https://example.com:444',
    'http://localhost:3201',
  ])
    expect(validOrigin(s)).toBe(true)
  for (const s of [
    'null',
    'https://example.com/',
    'https://example.com/path',
    'http://example.com',
    'https://user@example.com',
    'https://example.com?x=1',
  ])
    expect(validOrigin(s)).toBe(false)
})
