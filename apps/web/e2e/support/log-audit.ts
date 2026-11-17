import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

export default async function auditServerLog() {
  const output = await readFile('.next/dev-fake-server.log', 'utf8')
  assert(
    !output.includes('fake-access-token-e2e-only') &&
      !output.includes('fake-refresh-token-e2e-only'),
    'Server output contained a fake OAuth credential',
  )
  assert(
    !/os_pk_[A-Za-z0-9_-]{24,}/.test(output),
    'Server output contained a full publishable key',
  )
  assert(
    !/[A-Za-z0-9._%+-]+@example\.test/.test(output),
    'Server output contained a test customer/owner email',
  )
  assert(
    !/\/(?:m|api\/v1\/manage)\/[A-Za-z0-9_-]{43}/.test(output),
    'Server output contained a manage URL; incoming manage logs must be excluded',
  )
  assert(
    !/"(?:accessToken|refreshToken|access_token|refresh_token|idToken)"\s*:\s*"[^"\s]+"/.test(
      output,
    ),
    'Server output contained an OAuth token field',
  )
}
