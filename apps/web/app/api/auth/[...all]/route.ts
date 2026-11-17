import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

// OAuth credentials are server-only, including for authenticated owners.
const handlers = toNextJsHandler(auth)
function blocked(request: Request) {
  return ['/get-access-token', '/refresh-token', '/account-info'].some((path) =>
    new URL(request.url).pathname.endsWith(path),
  )
}
export async function GET(request: Request) {
  return blocked(request)
    ? new Response(null, { status: 404 })
    : handlers.GET(request)
}
export async function POST(request: Request) {
  return blocked(request)
    ? new Response(null, { status: 404 })
    : handlers.POST(request)
}
