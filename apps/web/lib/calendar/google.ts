import {
  CalendarAuthError,
  CalendarError,
  type Calendar,
  type CalendarEvent,
  type CalendarProvider,
  type Interval,
} from './types'

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(
    private readonly token: () => Promise<string>,
    private readonly request: typeof fetch = fetch,
  ) {}
  private async call<T>(
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    const token = await this.token()
    const response = await this.request(
      'https://www.googleapis.com/calendar/v3/' + path,
      {
        method,
        cache: 'no-store',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    )
    if (response.status === 401) throw new CalendarAuthError()
    if (!response.ok) throw new CalendarError(response.status)
    return response.status === 204 ? (undefined as T) : response.json()
  }
  async listCalendars() {
    const calendars: Calendar[] = []
    let page: string | undefined
    do {
      const result: { items?: Calendar[]; nextPageToken?: string } =
        await this.call(
          'users/me/calendarList' +
            (page ? '?pageToken=' + encodeURIComponent(page) : ''),
        )
      calendars.push(...(result.items ?? []))
      page = result.nextPageToken
    } while (page)
    return calendars
  }
  async freeBusy(calendarIds: string[], from: string, to: string) {
    const result = await this.call<{
      calendars: Record<string, { busy: Interval[]; errors?: unknown[] }>
    }>('freeBusy', 'POST', {
      timeMin: from,
      timeMax: to,
      items: calendarIds.map((id) => ({ id })),
    })
    const busy: Record<string, Interval[]> = {}
    for (const id of calendarIds) {
      const calendar = result.calendars[id]
      if (!calendar || calendar.errors?.length) throw new CalendarError(502)
      busy[id] = calendar.busy
    }
    return busy
  }
  private path(calendarId: string, eventId?: string) {
    return (
      'calendars/' +
      encodeURIComponent(calendarId) +
      '/events' +
      (eventId ? '/' + encodeURIComponent(eventId) : '') +
      '?sendUpdates=all'
    )
  }
  createEvent(calendarId: string, event: CalendarEvent) {
    return this.call<{ id: string }>(this.path(calendarId), 'POST', event)
  }
  async updateEvent(calendarId: string, eventId: string, event: CalendarEvent) {
    await this.call(this.path(calendarId, eventId), 'PATCH', event)
  }
  async deleteEvent(calendarId: string, eventId: string) {
    await this.call(this.path(calendarId, eventId), 'DELETE')
  }
}
