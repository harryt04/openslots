'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireBusiness } from '@/lib/businesses/current'
import {
  refreshLink,
  setBlocking,
  chooseBookingCalendar,
  unlinkAccount,
} from '@/lib/calendar-links/repository'
const schema = z.object({
  operation: z.enum(['connect', 'refresh', 'block', 'booking', 'unlink']),
  accountId: z.string().min(1),
  calendarId: z.string().default(''),
  blocks: z.boolean().default(false),
})
export async function mutateCalendar(input: z.input<typeof schema>) {
  const data = schema.parse(input)
  const { business, session } = await requireBusiness()
  try {
    if (data.operation === 'connect' || data.operation === 'refresh') {
      const result = await refreshLink(
        business,
        data.accountId,
        session.user.email,
      )
      revalidatePath('/', 'layout')
      return result.ok ? 'Saved' : result.message
    }
    if (data.operation === 'block')
      await setBlocking(
        business._id,
        data.accountId,
        data.calendarId,
        data.blocks,
      )
    if (data.operation === 'booking')
      await chooseBookingCalendar(business, data.accountId, data.calendarId)
    if (data.operation === 'unlink')
      await unlinkAccount(business, data.accountId)
    revalidatePath('/', 'layout')
    return 'Saved'
  } catch {
    return 'Could not save. Choose a connected writable booking calendar before unlinking, or retry.'
  }
}
