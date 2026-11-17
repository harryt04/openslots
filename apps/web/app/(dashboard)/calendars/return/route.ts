import { calendarNoticeCode } from '@/lib/calendar-links/notices'
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
  const code = result && calendarNoticeCode(result.message)
  if (code) destination.searchParams.set('notice', code)
  return Response.redirect(destination)
}
