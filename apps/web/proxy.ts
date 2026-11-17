import { getSessionCookie } from 'better-auth/cookies'
import { NextRequest, NextResponse } from 'next/server'

// Cookie-only session check — fast, edge-compatible optimistic redirect.
// NOTE: This does NOT cryptographically validate the session.
// Always validate the session server-side inside protected pages/routes
// via auth.api.getSession() before serving sensitive data.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request)

  // Redirect unauthenticated users away from protected routes
  if (!sessionCookie) {
    const { pathname } = request.nextUrl
    const protectedPrefixes = ['/dashboard']
    const isProtected = protectedPrefixes.some((prefix) =>
      pathname.startsWith(prefix),
    )
    if (isProtected) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  const response = NextResponse.next()
  const embeddable = /^\/b\//.test(request.nextUrl.pathname)
  const manage = request.nextUrl.pathname.startsWith('/m/')
  // Public customer pages talk only to this origin: analytics hosts are not
  // even allowed (TRD section 9).
  const analytics =
    embeddable || manage
      ? ''
      : ' https://us.i.posthog.com https://us-assets.i.posthog.com'
  response.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'production' ? '' : "'unsafe-eval'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'${analytics}; frame-ancestors ${embeddable ? '*' : manage ? "'self'" : "'none'"}; base-uri 'self'; form-action 'self'; object-src 'none'`,
  )
  if (manage) {
    // The token in the URL is the credential.
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    response.headers.set('Referrer-Policy', 'no-referrer')
  }
  return response
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
