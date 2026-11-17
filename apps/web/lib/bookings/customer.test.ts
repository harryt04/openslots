import { expect, it } from 'vitest'
import { bookingCustomer } from './customer'
const customer = {
  name: 'Test',
  email: 'test@example.test',
  phone: ' 123 ',
  notes: 'optional',
}
it('requires requested phone, trims it, and always permits absent notes', () => {
  for (const phone of [undefined, '', '  '])
    expect(() =>
      bookingCustomer(
        { askPhone: true, askNotes: true },
        { ...customer, phone },
      ),
    ).toThrow('customer.phone')
  expect(
    bookingCustomer(
      { askPhone: true, askNotes: true },
      { ...customer, notes: undefined },
    ).phone,
  ).toBe('123')
})
it('drops unrequested fields', () => {
  expect(
    bookingCustomer({ askPhone: false, askNotes: false }, customer),
  ).toEqual({ name: customer.name, email: customer.email })
})
