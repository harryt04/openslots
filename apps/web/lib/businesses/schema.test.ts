import { describe, expect, it } from 'vitest'

import { businessInputSchema } from './schema'

describe('businessInputSchema', () => {
  const ok = {
    name: 'Shear Bliss',
    slug: 'shear-bliss',
    timezone: 'America/Denver',
  }
  it('accepts valid input', () => {
    expect(businessInputSchema.safeParse(ok).success).toBe(true)
  })
  it('reports field errors', () => {
    const r = businessInputSchema.safeParse({
      name: ' ',
      slug: 'api',
      timezone: 'Mars/Base',
    })
    expect(r.success).toBe(false)
    const fields = r.error?.issues.map((i) => i.path[0])
    expect(fields).toEqual(expect.arrayContaining(['name', 'slug', 'timezone']))
  })
})
