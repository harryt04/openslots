/**
 * Reads of process.env that carry a rule. See docs/TRD.md section 10.
 */

type Env = Record<string, string | undefined>

/**
 * True when the instance runs against fakes instead of Google: the in-memory
 * calendar provider and the test-only sign-in. For automated tests and local
 * UI work only, so it refuses to turn on in production.
 */
export function isFakeGoogle(env: Env = process.env): boolean {
  if (env.E2E_FAKE_GOOGLE !== '1') return false
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'E2E_FAKE_GOOGLE=1 is for tests only and must not be set when NODE_ENV=production.',
    )
  }
  return true
}

export function requireEnv(name: string, env: Env = process.env): string {
  const value = env[name]
  if (!value) {
    throw new Error(`${name} environment variable is not set.`)
  }
  return value
}
