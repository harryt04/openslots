export type Interval = { start: string; end: string }
export type Calendar = {
  id: string
  summary: string
  accessRole?: string
  primary?: boolean
}
export type CalendarEvent = {
  id?: string
  summary: string
  description?: string
  start: { dateTime: string; timeZone?: string }
  end: { dateTime: string; timeZone?: string }
  attendees: { email: string; displayName?: string }[]
}
export interface CalendarProvider {
  listCalendars(): Promise<Calendar[]>
  freeBusy(
    calendarIds: string[],
    from: string,
    to: string,
  ): Promise<Record<string, Interval[]>>
  createEvent(calendarId: string, event: CalendarEvent): Promise<{ id: string }>
  updateEvent(
    calendarId: string,
    eventId: string,
    event: CalendarEvent,
  ): Promise<void>
  deleteEvent(calendarId: string, eventId: string): Promise<void>
}
export class CalendarAuthError extends Error {
  constructor() {
    super('Calendar connection needs reconnecting.')
    this.name = 'CalendarAuthError'
  }
}
export class CalendarError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason?: string,
  ) {
    super('Calendar request failed.')
    this.name = 'CalendarError'
  }
}
