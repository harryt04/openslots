import 'server-only'
import {
  CalendarAuthError,
  type Calendar,
  type CalendarEvent,
  type CalendarProvider,
  type Interval,
} from './types'
export type FakeState = {
  calendars: Calendar[]
  busy: Record<string, Interval[]>
  authFailure: boolean
  events: Record<string, { calendarId: string; event: CalendarEvent }>
  operations: {
    kind: 'create' | 'update' | 'delete'
    calendarId: string
    eventId: string
    event?: CalendarEvent
  }[]
}
// globalThis survives Next development module reloads and is shared by handlers/actions.
const globalFake = globalThis as typeof globalThis & {
  openSlotsCalendars?: Map<string, FakeState>
}
const states = (globalFake.openSlotsCalendars ??= new Map<string, FakeState>())
export function seedFakeCalendar(
  accountId: string,
  seed: Partial<FakeState> = {},
) {
  const state: FakeState = {
    calendars: [
      { id: 'primary', summary: 'Fake Google Calendar', accessRole: 'owner' },
    ],
    busy: {},
    authFailure: false,
    events: {},
    operations: [],
    ...structuredClone(seed),
  }
  states.set(accountId, state)
  return state
}
export class FakeCalendarProvider implements CalendarProvider {
  constructor(private readonly accountId: string) {}
  private state() {
    const state = states.get(this.accountId) ?? seedFakeCalendar(this.accountId)
    if (state.authFailure) throw new CalendarAuthError()
    return state
  }
  async listCalendars() {
    return structuredClone(this.state().calendars)
  }
  async freeBusy(ids: string[], from: string, to: string) {
    const state = this.state()
    return Object.fromEntries(
      ids.map((id) => [
        id,
        structuredClone(
          [
            ...(state.busy[id] ?? []),
            ...Object.values(state.events)
              .filter((e) => e.calendarId === id)
              .map((e) => ({
                start: e.event.start.dateTime,
                end: e.event.end.dateTime,
              })),
          ].filter(
            (i) =>
              Date.parse(i.start) < Date.parse(to) &&
              Date.parse(i.end) > Date.parse(from),
          ),
        ),
      ]),
    )
  }
  async createEvent(calendarId: string, event: CalendarEvent) {
    const state = this.state(),
      id = event.id ?? crypto.randomUUID()
    if (state.events[id]) return { id }
    state.events[id] = { calendarId, event: structuredClone(event) }
    state.operations.push({
      kind: 'create',
      calendarId,
      eventId: id,
      event: structuredClone(event),
    })
    return { id }
  }
  async updateEvent(calendarId: string, eventId: string, event: CalendarEvent) {
    const state = this.state()
    state.events[eventId] = { calendarId, event: structuredClone(event) }
    state.operations.push({
      kind: 'update',
      calendarId,
      eventId,
      event: structuredClone(event),
    })
  }
  async deleteEvent(calendarId: string, eventId: string) {
    const state = this.state()
    delete state.events[eventId]
    state.operations.push({ kind: 'delete', calendarId, eventId })
  }
}
