import { z } from 'zod'
import { requireBusiness } from '@/lib/businesses/current'
import { finishReturn } from '@/lib/calendar-links/returns'
export async function GET(request: Request) {
  const { business, session } = await requireBusiness()
  const nonce = z
    .string()
    .min(40)
    .max(100)
    .safeParse(new URL(request.url).searchParams.get('nonce'))
  const result = nonce.success
    ? await finishReturn(business, session.user.id, nonce.data)
    : undefined
  const destination = new URL('/calendars', request.url)
  if (result) destination.searchParams.set('notice', result.message)
  return Response.redirect(destination)
}
