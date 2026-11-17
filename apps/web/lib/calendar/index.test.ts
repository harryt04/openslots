import { APIError } from 'better-auth/api'
vi.mock('server-only', () => ({}))
import { expect, it, vi } from 'vitest'
const getAccessToken = vi.hoisted(() => vi.fn())
vi.mock('../auth', () => ({ auth: { api: { getAccessToken } } }))
vi.mock('../env', () => ({ isFakeGoogle: () => false }))
import {
  calendarProvider,
  CalendarAuthError,
  REQUIRED_SCOPES,
  CalendarError,
} from './index'

it('selects an account explicitly and uses Better Auth refreshed access tokens', async () => {
  getAccessToken.mockResolvedValue({
    accessToken: 'refreshed-token',
    scopes: REQUIRED_SCOPES,
  })
  const request = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(Response.json({ items: [] }))
  await calendarProvider({
    id: 'account-record',
    userId: 'owner',
  }).listCalendars()
  expect(getAccessToken).toHaveBeenCalledWith({
    body: { accountId: 'account-record', userId: 'owner' },
  })
  expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
    Authorization: 'Bearer refreshed-token',
  })
  request.mockRestore()
})
it('turns revoked refresh credentials into a reconnect error without exposing details', async () => {
  getAccessToken.mockRejectedValue(
    new APIError('BAD_REQUEST', {
      code: 'FAILED_TO_GET_ACCESS_TOKEN',
      message: 'Failed',
    }),
  )
  await expect(
    calendarProvider({ id: 'revoked', userId: 'owner' }).listCalendars(),
  ).rejects.toBeInstanceOf(CalendarAuthError)
})

it('keeps infrastructure failures transient', async () => {
  getAccessToken.mockRejectedValue(new Error('database unavailable'))
  await expect(
    calendarProvider({ id: 'a', userId: 'u' }).listCalendars(),
  ).rejects.toBeInstanceOf(CalendarError)
})
it.each(REQUIRED_SCOPES)(
  'rejects missing scope %s before Google',
  async (missing) => {
    getAccessToken.mockResolvedValue({
      accessToken: 'token',
      scopes: REQUIRED_SCOPES.filter((scope) => scope !== missing),
    })
    await expect(
      calendarProvider({ id: 'a', userId: 'u' }).listCalendars(),
    ).rejects.toBeInstanceOf(CalendarAuthError)
  },
)
