import { describe, expect, it } from 'vitest'

import { BLOCK_MINUTES } from './index'

describe('@openslots/core', () => {
  it('aligns slot blocks to five minutes', () => {
    expect(BLOCK_MINUTES).toBe(5)
  })
})
