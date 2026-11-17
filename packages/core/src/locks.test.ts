import { describe, expect, it } from 'vitest'

import { blockOf, lockBlocks, occupiedInterval } from './locks'

const start = new Date('2026-12-02T16:00:00Z')
const startBlock = start.getTime() / 60_000 / 5

describe('lockBlocks', () => {
  it('covers [start − bufferBefore, start + duration + bufferAfter) in 5 minute blocks', () => {
    const blocks = lockBlocks({
      start,
      durationMin: 30,
      bufferBeforeMin: 10,
      bufferAfterMin: 5,
    })
    expect(blocks).toEqual([
      startBlock - 2,
      startBlock - 1,
      startBlock,
      startBlock + 1,
      startBlock + 2,
      startBlock + 3,
      startBlock + 4,
      startBlock + 5,
      startBlock + 6,
    ])
    expect(blocks.every(Number.isInteger)).toBe(true)
  })

  it('makes overlapping bookings share a block and back-to-back ones not', () => {
    const a = lockBlocks({
      start,
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    })
    const next = new Date(start.getTime() + 60 * 60_000)
    const b = lockBlocks({
      start: next,
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    })
    const c = lockBlocks({
      start: next,
      durationMin: 60,
      bufferBeforeMin: 5,
      bufferAfterMin: 0,
    })
    expect(a.filter((x) => b.includes(x))).toEqual([])
    expect(a.filter((x) => c.includes(x))).toEqual([startBlock + 11])
  })

  it('refuses a start that is not on the 5 minute grid', () => {
    expect(() =>
      lockBlocks({
        start: new Date('2026-12-02T16:03:00Z'),
        durationMin: 30,
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
      }),
    ).toThrow(RangeError)
  })

  it('agrees with blockOf', () => {
    expect(blockOf(start)).toBe(startBlock)
    expect(blockOf(new Date(start.getTime() + 4 * 60_000))).toBe(startBlock)
  })
})

describe('occupiedInterval', () => {
  it('includes both buffers', () => {
    expect(
      occupiedInterval({
        start,
        durationMin: 180,
        bufferBeforeMin: 0,
        bufferAfterMin: 15,
      }),
    ).toEqual({
      start,
      end: new Date('2026-12-02T19:15:00Z'),
    })
  })
})
