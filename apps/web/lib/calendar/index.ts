import 'server-only'
import { ObjectId } from 'mongodb'
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
  if (isFakeGoogle()) {
    const fake = new FakeCalendarProvider(account.id)
    const owned = async () => {
      if (!ObjectId.isValid(account.id)) throw new CalendarAuthError()
      const { getDb } = await import('../mongo-client')
      const found = await (await getDb()).collection('account').findOne({
        _id: new ObjectId(account.id),
        providerId: 'google',
        userId: {
          $in: ObjectId.isValid(account.userId)
            ? [account.userId, new ObjectId(account.userId)]
            : [account.userId],
        },
      })
      if (!found) throw new CalendarAuthError()
    }
    return {
      async listCalendars() {
        await owned()
        return fake.listCalendars()
      },
      async freeBusy(...args) {
        await owned()
        return fake.freeBusy(...args)
      },
      async createEvent(...args) {
        await owned()
        return fake.createEvent(...args)
      },
      async updateEvent(...args) {
        await owned()
        return fake.updateEvent(...args)
      },
      async deleteEvent(...args) {
        await owned()
        return fake.deleteEvent(...args)
      },
    }
  }
  return new GoogleCalendarProvider(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let timer: ReturnType<typeof setTimeout> | undefined
        const result = await Promise.race([
          auth.api.getAccessToken({
            body: { accountId: account.id, userId: account.userId },
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new CalendarError(503)), 15_000)
          }),
        ]).finally(() => clearTimeout(timer))
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
