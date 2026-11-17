/**
 * @openslots/core: the slot engine, zod schemas and shared types.
 *
 * Everything in this package is pure: no I/O and no reading of the clock.
 * See docs/TRD.md sections 3, 4, 5 and 7.
 */
export * from './schemas'
export * from './api'
export * from './slots'
export * from './locks'
export {
  addDays,
  daysBetween,
  eachDate,
  isLocalDate,
  localDateOf,
  wallTimeToUtc,
  weekday,
} from './time'
