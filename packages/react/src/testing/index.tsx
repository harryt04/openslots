'use client'

/**
 * Workspace-only helpers for tests and the app's component gallery. This
 * entry is not in `publishConfig`, so it is never published.
 */
import {
  Flow,
  type BookingFlowInitialState,
  type BookingFlowProps,
} from '../components/booking-flow'

export * from './mock-api'
export type { BookingFlowInitialState }

/** `BookingFlow`, started at a given step and state (gallery states). */
export function BookingFlowAt({
  initial,
  ...props
}: BookingFlowProps & { initial: BookingFlowInitialState }) {
  return <Flow {...props} initial={initial} />
}
