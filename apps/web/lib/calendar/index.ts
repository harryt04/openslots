import 'server-only'
import { APIError } from 'better-auth/api'
import { createHash } from 'node:crypto'
import { auth } from '../auth'
import { isFakeGoogle } from '../env'
import { FakeCalendarProvider } from './fake'
import { GoogleCalendarProvider } from './google'
import {
  CalendarAuthError,
  CalendarError,
  type CalendarProvider,
} from './types'
export * from './types'

/** Server callers must resolve account ownership before invoking this factory.
 * accountId is Better Auth's account record id, not Google's subject id.
 * Fake sign-ins also have Google account records.
 */
export function calendarProvider(account: {
  id: string
  userId: string
}): CalendarProvider {
  if (isFakeGoogle()) return new FakeCalendarProvider(account.id)
  return new GoogleCalendarProvider(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await auth.api.getAccessToken({
          body: { accountId: account.id, userId: account.userId },
        })
        if (
          !result.accessToken ||
          REQUIRED_SCOPES.some((scope) => !result.scopes.includes(scope))
        )
          throw new CalendarAuthError()
        return result.accessToken
      } catch (error) {
        if (error instanceof CalendarAuthError) throw error
        if (error instanceof APIError) {
          if (error.body?.code === 'FAILED_TO_GET_ACCESS_TOKEN') {
            // Better Auth folds transient refresh failures into this code too.
            if (attempt === 0) continue
            throw new CalendarAuthError()
          }
          if (error.body?.code === 'ACCOUNT_NOT_FOUND')
            throw new CalendarAuthError()
        }
        throw new CalendarError(503)
      }
    }
    throw new CalendarAuthError()
  })
}

export const REQUIRED_SCOPES = [
  'calendar.freebusy',
  'calendar.calendarlist.readonly',
  'calendar.events',
].map((scope) => 'https://www.googleapis.com/auth/' + scope)
/** Stable lowercase hex is a subset of Google's base32hex alphabet. Persist/reuse
 * this id for every create retry of the same booking; never generate a new id. */
export function eventIdForBooking(bookingId: string): string {
  return createHash('sha256').update(bookingId).digest('hex')
}
