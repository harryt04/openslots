import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
let mongo: MongoMemoryServer
let auth: typeof import('./auth').auth
beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  process.env.BETTER_AUTH_SECRET = 'test-secret-at-least-32-characters-long'
  process.env.BETTER_AUTH_URL = 'http://localhost:3000'
  process.env.GOOGLE_CLIENT_ID = 'test-client'
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
  process.env.OPENSLOTS_ALLOWED_EMAILS = 'allowed@example.test'
  ;({ auth } = await import('./auth'))
}, 60000)
afterAll(async () => {
  await mongo?.stop()
  vi.unstubAllGlobals()
})
it.each([
  ['refused@example.test', true, false],
  ['allowed@example.test', false, false],
  ['allowed@example.test', true, true],
])(
  'redirects callback for %s verified=%s',
  async (email, verified, allowed) => {
    // Use the installed provider's exchange and userinfo entry points, preserving
    // the real handler, OAuth state, database hooks and callback error handling.
    const context = await auth.$context
    const google = context.socialProviders.find(
      (provider) => provider.id === 'google',
    )!
    const exchange = vi
      .spyOn(google, 'validateAuthorizationCode')
      .mockResolvedValue({ accessToken: 'mock-token', scopes: [] })
    const userinfo = vi.spyOn(google, 'getUserInfo').mockResolvedValue({
      user: { email, name: 'Test', emailVerified: verified },
      data: { sub: email, email, email_verified: verified },
    })
    const start = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/social', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          provider: 'google',
          callbackURL: '/',
          errorCallbackURL: '/login',
        }),
      }),
    )
    const { url } = await start.json()
    const state = new URL(url).searchParams.get('state')!
    const cookie = start.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    const result = await auth.handler(
      new Request(
        'http://localhost:3000/api/auth/callback/google?code=mock&state=' +
          encodeURIComponent(state),
        { headers: { cookie } },
      ),
    )
    expect(result.status).toBe(302)
    expect(result.headers.get('location')).toBe(
      allowed
        ? '/'
        : '/login?error=EMAIL_NOT_ALLOWED&error_description=EMAIL_NOT_ALLOWED',
    )
    exchange.mockRestore()
    userinfo.mockRestore()
  },
)
