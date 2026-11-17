import 'server-only'
import {
  CalendarAuthError,
  CalendarError,
  type Calendar,
  type CalendarEvent,
  type CalendarProvider,
  type Interval,
} from './types'
export type FakeState = {
  pause?: (kind: 'create' | 'update' | 'delete') => Promise<void>
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
      {
        id: 'primary',
        summary: 'Fake Google Calendar',
        primary: true,
        accessRole: 'owner',
      },
      { id: 'personal', summary: 'Personal', accessRole: 'writer' },
      { id: 'holidays', summary: 'Holidays', accessRole: 'reader' },
    ],
    busy: {},
    authFailure: false,
    events: {},
    operations: [],
    ...structuredClone({ ...seed, pause: undefined }),
    pause: seed.pause,
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
              .filter(
                (e) => e.calendarId === id && e.event.status !== 'cancelled',
              )
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
  async createEvent(
    calendarId: string,
    event: CalendarEvent,
    notAfter?: number,
  ) {
    const state = this.state(),
      id = event.id ?? crypto.randomUUID()
    await state.pause?.('create')
    if (notAfter !== undefined && Date.now() >= notAfter)
      throw new CalendarError(503)
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
  async updateEvent(
    calendarId: string,
    eventId: string,
    event: CalendarEvent,
    notAfter?: number,
  ) {
    const state = this.state()
    await state.pause?.('update')
    if (notAfter !== undefined && Date.now() >= notAfter)
      throw new CalendarError(503)
    if (!state.events[eventId]) throw new CalendarError(404)
    state.events[eventId] = {
      calendarId,
      event: {
        ...state.events[eventId]?.event,
        ...structuredClone(event),
        ...(event.description === undefined &&
        state.events[eventId]?.event.description !== undefined
          ? { description: state.events[eventId]!.event.description }
          : {}),
      },
    }
    state.operations.push({
      kind: 'update',
      calendarId,
      eventId,
      event: structuredClone(event),
    })
  }
  async deleteEvent(calendarId: string, eventId: string, notAfter?: number) {
    const state = this.state()
    await state.pause?.('delete')
    if (notAfter !== undefined && Date.now() >= notAfter)
      throw new CalendarError(503)
    if (state.events[eventId]) state.events[eventId].event.status = 'cancelled'
    state.operations.push({ kind: 'delete', calendarId, eventId })
  }
}
