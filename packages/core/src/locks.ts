/**
 * Helpers for the booking write path (docs/TRD.md section 5).
 */
import { BLOCK_MINUTES } from './schemas'
import type { Interval } from './schemas'

const MS_PER_MINUTE = 60_000

export interface BookingSpan {
  start: Date
  durationMin: number
  bufferBeforeMin: number
  bufferAfterMin: number
}

/**
 * The time a booking occupies, buffers included:
 * `[start − bufferBefore, start + duration + bufferAfter)`. Use it to turn
 * existing bookings into `busy` intervals for `computeSlots`.
 */
export function occupiedInterval(span: BookingSpan): Interval {
  const startMs = span.start.getTime()
  return {
    start: new Date(startMs - span.bufferBeforeMin * MS_PER_MINUTE),
    end: new Date(
      startMs + (span.durationMin + span.bufferAfterMin) * MS_PER_MINUTE,
    ),
  }
}

/** The 5 minute block containing an instant: UTC epoch minutes ÷ 5, floored. */
export function blockOf(instant: Date): number {
  return Math.floor(instant.getTime() / MS_PER_MINUTE / BLOCK_MINUTES)
}

/**
 * Every `slot_locks` block for a booking: one integer per 5 minute block in
 * its occupied interval, ascending. Throws if the start or any length is not
 * aligned to 5 minutes, since locks would then not line up exactly.
 */
export function lockBlocks(span: BookingSpan): number[] {
  const epochMin = span.start.getTime() / MS_PER_MINUTE
  const parts = [
    epochMin,
    span.durationMin,
    span.bufferBeforeMin,
    span.bufferAfterMin,
  ]
  if (!parts.every((n) => Number.isInteger(n) && n % BLOCK_MINUTES === 0)) {
    throw new RangeError('Booking start and lengths must align to 5 minutes')
  }
  if (
    span.durationMin <= 0 ||
    span.bufferBeforeMin < 0 ||
    span.bufferAfterMin < 0
  ) {
    throw new RangeError('Duration must be positive and buffers non-negative')
  }
  const first = (epochMin - span.bufferBeforeMin) / BLOCK_MINUTES
  const end =
    (epochMin + span.durationMin + span.bufferAfterMin) / BLOCK_MINUTES
  const blocks: number[] = []
  for (let b = first; b < end; b++) blocks.push(b)
  return blocks
}
