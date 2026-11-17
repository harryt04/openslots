/**
 * @openslots/core: the slot engine, zod schemas and shared types.
 *
 * Everything in this package is pure: no I/O and no reading of the clock.
 * See docs/TRD.md sections 3 and 4.
 */

/** Slot locks and all service durations are aligned to this many minutes. */
export const BLOCK_MINUTES = 5
