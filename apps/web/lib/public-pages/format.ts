/**
 * Dates and times for the manage page, in a named timezone. Formatting only;
 * availability is never computed here (that is `packages/core`).
 */

const clock = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

function timeParts(iso: string, timeZone: string) {
  const parts = clock(timeZone).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    time: `${get('hour')}:${get('minute')}`,
    period: get('dayPeriod').toUpperCase(),
  }
}

/** "Thursday, December 3, 2026" */
export function formatLongDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

function offsetMinutes(iso: string, timeZone: string): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(new Date(iso))
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
  )
}

function shortZone(iso: string, timeZone: string): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date(iso))
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
  )
}

/**
 * "1:30 – 2:30 PM", or "11:30 AM – 12:30 PM" when the periods differ.
 *
 * When the clocks change between the start and the end, each time carries
 * its zone abbreviation ("1:30 AM MDT – 1:30 AM MST"), because the plain
 * wall-clock times would otherwise hide how long the booking is.
 */
export function formatTimeSpan(
  start: string,
  end: string,
  timeZone: string,
): string {
  const a = timeParts(start, timeZone)
  const b = timeParts(end, timeZone)
  if (offsetMinutes(start, timeZone) !== offsetMinutes(end, timeZone)) {
    return `${a.time} ${a.period} ${shortZone(start, timeZone)} – ${b.time} ${b.period} ${shortZone(end, timeZone)}`
  }
  return a.period === b.period
    ? `${a.time} – ${b.time} ${b.period}`
    : `${a.time} ${a.period} – ${b.time} ${b.period}`
}

/** "Mountain Time", the zone's generic name, falling back to its long name. */
export function zoneName(iso: string, timeZone: string): string {
  for (const style of ['longGeneric', 'long'] as const) {
    try {
      const name = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: style,
      })
        .formatToParts(new Date(iso))
        .find((p) => p.type === 'timeZoneName')?.value
      if (name) return name
    } catch {
      // Try the next style.
    }
  }
  return timeZone
}

/** The end of a booking that starts at `start` and lasts `minutes`. */
export function addMinutes(start: string, minutes: number): string {
  return new Date(Date.parse(start) + minutes * 60_000).toISOString()
}
