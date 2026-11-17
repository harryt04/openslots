import type { TimeRange } from '@openslots/core'

/** Monday to Friday, 09:00 to 17:00. Index 0 is Sunday. */
export function defaultWeekly(): TimeRange[][] {
  const day = [{ startMin: 9 * 60, endMin: 17 * 60 }]
  return [[], day, day, day, day, day, []].map((d) => d.map((r) => ({ ...r })))
}
