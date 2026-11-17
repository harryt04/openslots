import 'server-only'
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
        signal: AbortSignal.timeout(15_000),
        method,
        cache: 'no-store',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    ).catch(() => {
      throw new CalendarError(503)
    })
    if (response.status === 401) throw new CalendarAuthError()
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}))
      const reasons =
        detail.error?.errors?.map(
          (error: { reason: string }) => error.reason,
        ) ?? []
      if (
        response.status === 403 &&
        (reasons.some((reason: string) =>
          // Only reasons that reconnecting can fix. A plain `forbidden`
          // usually means no write access to that one calendar, which stays
          // a CalendarError(403) so the owner is told to pick another.
          ['insufficientPermissions', 'authError'].includes(reason),
        ) ||
          detail.error?.status === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')
      )
        throw new CalendarAuthError()
      throw new CalendarError(
        response.status,
        reasons.includes('duplicate') ? 'duplicate' : undefined,
      )
    }
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
      calendars.push(
        ...(result.items ?? []).map(({ id, summary, accessRole, primary }) => ({
          id,
          summary,
          accessRole,
          primary,
        })),
      )
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
  async createEvent(calendarId: string, event: CalendarEvent) {
    try {
      return await this.call<{ id: string }>(
        this.path(calendarId),
        'POST',
        event,
      )
    } catch (error) {
      if (
        event.id &&
        error instanceof CalendarError &&
        error.status === 409 &&
        error.reason === 'duplicate'
      )
        return { id: event.id }
      throw error
    }
  }
  async updateEvent(calendarId: string, eventId: string, event: CalendarEvent) {
    await this.call(this.path(calendarId, eventId), 'PATCH', event)
  }
  async deleteEvent(calendarId: string, eventId: string) {
    try {
      await this.call(this.path(calendarId, eventId), 'DELETE')
    } catch (error) {
      if (error instanceof CalendarError && [404, 410].includes(error.status))
        return
      throw error
    }
  }
}
