import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from './auth'

/**
 * The signed-in session, or a redirect to /login.
 *
 * Call this in every signed-in page, action and route handler. The
 * (dashboard) layout also checks, but a layout does not stop its page from
 * rendering, so a page must never assume the layout already guarded it.
 */
export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('/login')
  }
  return session
}
