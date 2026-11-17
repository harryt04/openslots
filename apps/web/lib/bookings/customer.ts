import type { CreateBookingBody } from '@openslots/core'
import { ApiFailure } from '../public-api/security'

export function bookingCustomer(
  service: { askPhone: boolean; askNotes: boolean },
  customer: CreateBookingBody['customer'],
) {
  if (service.askPhone && !customer.phone?.trim())
    throw new ApiFailure('invalid_request', 'customer.phone is required')
  return {
    name: customer.name,
    email: customer.email,
    ...(service.askPhone ? { phone: customer.phone!.trim() } : {}),
    ...(service.askNotes && customer.notes ? { notes: customer.notes } : {}),
  }
}
