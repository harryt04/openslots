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
async function signInWithGoogle(
  email: string,
  verified: boolean,
  sessionCookie?: string,
) {
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
  try {
    const start = await auth.handler(
      new Request(
        'http://localhost:3000/api/auth/' +
          (sessionCookie ? 'link-social' : 'sign-in/social'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionCookie ? { cookie: sessionCookie } : {}),
            origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            provider: 'google',
            callbackURL: '/',
            errorCallbackURL: '/login',
          }),
        },
      ),
    )
    const { url } = await start.json()
    const state = new URL(url).searchParams.get('state')!
    const cookie = start.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    return await auth.handler(
      new Request(
        'http://localhost:3000/api/auth/callback/google?code=mock&state=' +
          encodeURIComponent(state),
        {
          headers: {
            cookie: [cookie, sessionCookie].filter(Boolean).join('; '),
          },
        },
      ),
    )
  } finally {
    exchange.mockRestore()
    userinfo.mockRestore()
  }
}

async function rowCounts() {
  const { MongoClient } = await import('mongodb')
  const client = await MongoClient.connect(mongo.getUri())
  try {
    const db = client.db(`openslots-${process.env.NODE_ENV}`)
    const [user, account, session] = await Promise.all(
      ['user', 'account', 'session'].map((name) =>
        db.collection(name).countDocuments(),
      ),
    )
    return { user, account, session }
  } finally {
    await client.close()
  }
}

const REFUSED =
  '/login?error=EMAIL_NOT_ALLOWED&error_description=EMAIL_NOT_ALLOWED'

// These run in order and share one database.
it('refuses an account that is not on the allowlist and stores nothing', async () => {
  const result = await signInWithGoogle('refused@example.test', true)
  expect(result.status).toBe(302)
  expect(result.headers.get('location')).toBe(REFUSED)
  expect(await rowCounts()).toEqual({ user: 0, account: 0, session: 0 })
})

it('refuses an allowlisted email that Google has not verified', async () => {
  const result = await signInWithGoogle('allowed@example.test', false)
  expect(result.headers.get('location')).toBe(REFUSED)
  expect(await rowCounts()).toEqual({ user: 0, account: 0, session: 0 })
})

it('signs in an allowed, verified account', async () => {
  const result = await signInWithGoogle('allowed@example.test', true)
  expect(result.status).toBe(302)
  expect(result.headers.get('location')).toBe('/')
  expect(await rowCounts()).toEqual({ user: 1, account: 1, session: 1 })
})

it('refuses an existing user who was removed from the allowlist, with no new session', async () => {
  process.env.OPENSLOTS_ALLOWED_EMAILS = 'someone-else@example.test'
  try {
    const result = await signInWithGoogle('allowed@example.test', true)
    expect(result.headers.get('location')).toBe(REFUSED)
    expect(await rowCounts()).toEqual({ user: 1, account: 1, session: 1 })
  } finally {
    process.env.OPENSLOTS_ALLOWED_EMAILS = 'allowed@example.test'
  }
})

it('refuses a second Google identity outside the allowlist on linkSocial callback', async () => {
  const signedIn = await signInWithGoogle('allowed@example.test', true)
  const cookie = signedIn.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ')
  const before = await rowCounts()
  const result = await signInWithGoogle(
    'second-refused@example.test',
    true,
    cookie,
  )
  expect(result.headers.get('location')).toContain('error=EMAIL_NOT_ALLOWED')
  expect(await rowCounts()).toEqual(before)
})
