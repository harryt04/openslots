import { vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { expect, it } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
it('fake sign-in provisions a real Google account record', async () => {
  const mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  process.env.BETTER_AUTH_SECRET = 'test-secret-at-least-32-characters-long'
  process.env.BETTER_AUTH_URL = 'http://localhost:3000'
  process.env.E2E_FAKE_GOOGLE = '1'
  try {
    const { auth } = await import('./auth')
    const result = await auth.api.signUpEmail({
      body: {
        email: 'owner@example.test',
        name: 'Owner',
        password: 'test-password-long',
      },
    })
    const context = await auth.$context
    const accounts = await context.internalAdapter.findAccounts(result.user.id)
    const google = accounts.find((account) => account.providerId === 'google')
    expect(google).toMatchObject({
      userId: result.user.id,
      providerId: 'google',
    })
    expect(google?.id).not.toBe(result.user.id)
    const { calendarProvider, CalendarAuthError } = await import('./calendar')
    if (!google) throw new Error('Expected fake Google account')
    expect(
      await calendarProvider({
        id: google.id,
        userId: result.user.id,
      }).listCalendars(),
    ).toHaveLength(3)
    await expect(
      calendarProvider({
        id: google.id,
        userId: 'someone-else',
      }).listCalendars(),
    ).rejects.toBeInstanceOf(CalendarAuthError)
    await (await import('./mongo-client')).closeMongoClient()
  } finally {
    await mongo.stop()
  }
}, 60000)
