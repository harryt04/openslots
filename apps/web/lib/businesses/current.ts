import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { requireSession } from '../session'
import { resolveCurrentBusiness, type BusinessDoc } from './repository'

export const CURRENT_BUSINESS_COOKIE = 'openslots_business'

/**
 * The signed-in session and the current business, owned by that user.
 *
 * Every admin page, server action and route handler calls this instead of
 * reading businesses itself. The business id in the cookie is only a hint:
 * it is re-validated against `ownerUserId` on every call, and a forged or
 * stale id falls back to the user's first business. With no business the
 * user is sent to onboarding.
 */
export async function requireBusiness(): Promise<{
  session: Awaited<ReturnType<typeof requireSession>>
  business: BusinessDoc
  businesses: BusinessDoc[]
}> {
  const session = await requireSession()
  const remembered = (await cookies()).get(CURRENT_BUSINESS_COOKIE)?.value
  const resolved = await resolveCurrentBusiness(session.user.id, remembered)
  if (!resolved) redirect('/onboarding')
  return {
    session,
    business: resolved.current,
    businesses: resolved.all,
  }
}
