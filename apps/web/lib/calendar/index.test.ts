import { expect, it, vi } from 'vitest'
const getAccessToken = vi.hoisted(() => vi.fn())
vi.mock('../auth', () => ({ auth: { api: { getAccessToken } } }))
vi.mock('../env', () => ({ isFakeGoogle: () => false }))
import { calendarProvider, CalendarAuthError } from './index'

it('selects an account explicitly and uses Better Auth refreshed access tokens', async () => {
  getAccessToken.mockResolvedValue({ accessToken: 'refreshed-token' })
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
  getAccessToken.mockRejectedValue(new Error('invalid_grant'))
  await expect(
    calendarProvider({ id: 'revoked', userId: 'owner' }).listCalendars(),
  ).rejects.toBeInstanceOf(CalendarAuthError)
})
