import { describe, expect, it } from 'vitest'

import { generatePublishableKey, isPublishableKey } from './keys'
import { slugProblem, slugify } from './slug'

describe('slugify', () => {
  it('suggests a clean slug from a name', () => {
    expect(slugify('Shear Bliss Salon')).toBe('shear-bliss-salon')
    expect(slugify("  Zoë's Café & Bar!  ")).toBe('zoes-cafe-and-bar')
    expect(slugify('---')).toBe('')
  })
  it('truncates without a trailing hyphen', () => {
    const slug = slugify('a'.repeat(39) + ' b' + ' c')
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('slugProblem', () => {
  it('accepts good slugs', () => {
    expect(slugProblem('shear-bliss')).toBeNull()
    expect(slugProblem('abc')).toBeNull()
  })
  it.each(['ab', 'Has-Caps', '-lead', 'trail-', 'dou--ble', 'sp ace', 'a_b'])(
    'refuses %s',
    (slug) => {
      expect(slugProblem(slug)).not.toBeNull()
    },
  )
  it.each(['api', 'login', 'settings', 'dev', 'onboarding'])(
    'refuses reserved word %s',
    (slug) => {
      expect(slugProblem(slug)).toMatch(/reserved/)
    },
  )
})

describe('publishable keys', () => {
  it('has the os_pk_ form and is unique', () => {
    const keys = new Set(Array.from({ length: 200 }, generatePublishableKey))
    expect(keys.size).toBe(200)
    for (const key of keys) {
      expect(key.startsWith('os_pk_')).toBe(true)
      expect(isPublishableKey(key)).toBe(true)
    }
    expect(isPublishableKey('os_pk_short')).toBe(false)
  })
})
