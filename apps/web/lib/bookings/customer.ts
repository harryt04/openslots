import { customerFieldsFor, type CreateBookingBody } from '@openslots/core'

import { ApiFailure } from '../public-api/security'

/**
 * The customer fields to store for a booking of this service. The rule lives
 * in `customerFieldsFor` in `@openslots/core`, which the booking form uses
 * too: phone is required when the service asks for it, notes are always
 * optional, and a field the service does not ask for is dropped.
 */
export function bookingCustomer(
  service: { askPhone: boolean; askNotes: boolean },
  customer: CreateBookingBody['customer'],
) {
  const parsed = customerFieldsFor(service).safeParse(customer)
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join('.') || 'customer'
    throw new ApiFailure('invalid_request', `customer.${field} is required`)
  }
  return parsed.data
}
