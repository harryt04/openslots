import { describe, expect, it } from 'vitest'

import { ROOT_CLASS } from './index'

describe('@openslots/react', () => {
  it('scopes styles under one root class', () => {
    expect(ROOT_CLASS).toBe('openslots')
  })
})
