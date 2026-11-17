import { getDb } from '@/lib/mongo-client'

export const dynamic = 'force-dynamic'

/**
 * Liveness and database reachability, for Docker and reverse-proxy health
 * checks. Says nothing about the instance beyond that.
 */
export async function GET() {
  try {
    await (await getDb()).command({ ping: 1 })
    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { ok: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
