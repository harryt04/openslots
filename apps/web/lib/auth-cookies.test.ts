import { expect, test, vi } from 'vitest'
vi.mock('server-only', () => ({}))

test('HTTPS Better Auth URL configures Secure, HttpOnly, SameSite=Lax session cookies', async () => {
  vi.stubEnv('BETTER_AUTH_URL', 'https://booking.example.test')
  vi.stubEnv(
    'BETTER_AUTH_SECRET',
    'cookie-test-placeholder-at-least-32-characters',
  )
  vi.stubEnv('MONGO_CONNECTION_STRING', 'mongodb://localhost:27017')
  vi.stubEnv('GOOGLE_CLIENT_ID', 'placeholder')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'placeholder')
  vi.stubEnv('E2E_FAKE_GOOGLE', '')
  try {
    const { auth } = await import('./auth')
    const context = await auth.$context
    expect(context.authCookies.sessionToken.attributes).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
    expect(context.authCookies.sessionToken.name).toMatch(/^__Secure-/)
  } finally {
    vi.unstubAllEnvs()
  }
})
