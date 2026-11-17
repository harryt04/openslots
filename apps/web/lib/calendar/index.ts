import { auth } from '../auth'
import { isFakeGoogle } from '../env'
import { FakeCalendarProvider } from './fake'
import { GoogleCalendarProvider } from './google'
import { CalendarAuthError, type CalendarProvider } from './types'
export * from './types'

/** Server callers must resolve account ownership before invoking this factory.
 * accountId is Better Auth's account record id, not Google's subject id.
 * Fake sign-ins use their user id as a stable virtual Google account id.
 */
export function calendarProvider(account: {
  id: string
  userId: string
}): CalendarProvider {
  if (isFakeGoogle()) return new FakeCalendarProvider(account.id)
  return new GoogleCalendarProvider(async () => {
    try {
      const result = await auth.api.getAccessToken({
        body: { accountId: account.id, userId: account.userId },
      })
      if (!result.accessToken) throw new CalendarAuthError()
      return result.accessToken
    } catch {
      throw new CalendarAuthError()
    }
  })
}
