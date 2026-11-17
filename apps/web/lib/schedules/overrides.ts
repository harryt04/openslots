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

/** Ranges merged where they touch, so 9-12 plus 12-17 equals 9-17. */
function coverage(ranges: TimeRange[]): string {
  const merged: TimeRange[] = []
  for (const r of [...ranges].sort((a, b) => a.startMin - b.startMin)) {
    const last = merged[merged.length - 1]
    if (last && r.startMin <= last.endMin)
      last.endMin = Math.max(last.endMin, r.endMin)
    else merged.push({ ...r })
  }
  return merged.map((r) => `${r.startMin}-${r.endMin}`).join(',')
}

const sameCoverage = (a: TimeRange[], b: TimeRange[]) =>
  coverage(a) === coverage(b)

/**
 * What an override does compared with the normal hours of its weekday:
 * - `closed`: no ranges.
 * - `extra-day`: the weekday is normally closed, and the override opens it.
 * - `short-day`: opens for less time than usual, within the day's usual
 *   opening and closing times (a lunch gap may be filled in).
 * - `usual-hours`: open at exactly the usual times.
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
  if (sameCoverage(override.ranges, normal)) return 'usual-hours'
  return 'changed-hours'
}

export function sortOverrides<T extends { date: string }>(overrides: T[]): T[] {
  return [...overrides].sort((a, b) => a.date.localeCompare(b.date))
}
