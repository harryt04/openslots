'use server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { requireBusiness } from '@/lib/businesses/current'
import { getBooking } from '@/lib/bookings/repository'
import { cancelBooking, rescheduleBooking } from '@/lib/bookings/service'
import { ApiFailure } from '@/lib/public-api/security'
const inputSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  start: z.string().datetime().optional(),
  action: z.enum(['cancel', 'reschedule']),
})
export async function changeBooking(input: unknown) {
  const { business } = await requireBusiness()
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid booking or time.' }
  const { id, start, action } = parsed.data
  if (!(await getBooking(business._id, new ObjectId(id))))
    return { error: 'Booking not found.' }
  try {
    if (action === 'cancel') await cancelBooking(business, new ObjectId(id))
    else {
      if (!start) return { error: 'Choose a new time.' }
      await rescheduleBooking(business, new ObjectId(id), new Date(start))
    }
    return { ok: true }
  } catch (error) {
    return {
      error:
        error instanceof ApiFailure
          ? error.message === error.code.replaceAll('_', ' ')
            ? ((
                {
                  slot_taken:
                    'That time was just taken. Choose another time or try again in a moment.',
                  calendar_unavailable:
                    'Calendar unavailable. Please try again later.',
                  booking_not_changeable:
                    'This booking can no longer be changed.',
                  not_found: 'Booking not found.',
                } as Record<string, string>
              )[error.code] ?? error.message)
            : error.message
          : 'Unable to update this booking. Please try again.',
    }
  }
}
