import type { ScheduleOverride, TimeRange } from '@openslots/core'
import { weekday } from '@openslots/core'

export type OverrideKind =
  'closed' | 'short-day' | 'extra-day' | 'changed-hours' | 'usual-hours'

const total = (ranges: TimeRange[]) =>
  ranges.reduce((sum, r) => sum + (r.endMin - r.startMin), 0)

/** Inside the span from the day's first opening to its last closing. */
const withinSpan = (r: TimeRange, ranges: TimeRange[]) =>
  r.startMin >= Math.min(...ranges.map((n) => n.startMin)) &&
  r.endMin <= Math.max(...ranges.map((n) => n.endMin))

/**
 * What an override does compared with the normal hours of its weekday:
 * - `closed`: no ranges.
 * - `extra-day`: the weekday is normally closed, and the override opens it.
 * - `short-day`: opens for less time than usual, within the day's usual
 *   opening and closing times (a lunch gap may be filled in).
 * - `usual-hours`: the same time open as usual.
 * - `changed-hours`: anything else, such as later or longer hours.
 */
export function overrideKind(
  override: ScheduleOverride,
  weekly: TimeRange[][],
): OverrideKind {
  if (override.ranges.length === 0) return 'closed'
  const normal = weekly[weekday(override.date)] ?? []
  if (normal.length === 0) return 'extra-day'
  const everyInside = override.ranges.every((r) => withinSpan(r, normal))
  if (everyInside && total(override.ranges) < total(normal)) return 'short-day'
  if (everyInside && total(override.ranges) === total(normal))
    return 'usual-hours'
  return 'changed-hours'
}

export function sortOverrides<T extends { date: string }>(overrides: T[]): T[] {
  return [...overrides].sort((a, b) => a.date.localeCompare(b.date))
}
