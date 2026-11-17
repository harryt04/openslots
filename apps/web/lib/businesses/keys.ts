import { randomBytes } from 'node:crypto'

export const PUBLISHABLE_KEY_PREFIX = 'os_pk_'

/** A new publishable key: `os_pk_` plus 24 random bytes, base64url. */
export function generatePublishableKey(): string {
  return PUBLISHABLE_KEY_PREFIX + randomBytes(24).toString('base64url')
}

export function isPublishableKey(value: string): boolean {
  return /^os_pk_[A-Za-z0-9_-]{32}$/.test(value)
}
