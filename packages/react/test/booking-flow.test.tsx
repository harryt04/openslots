import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BookingFlow } from '../src'
import {
  createMockApi,
  MOCK_HOST,
  MOCK_KEY,
  type MockApi,
} from '../src/testing'

// Tuesday, December 1, 2026, 1:00 AM in Denver.
const NOW = new Date('2026-12-01T08:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
})

function setup(
  props: Partial<Parameters<typeof BookingFlow>[0]> = {},
  api: MockApi = createMockApi({ now: () => NOW }),
) {
  const onBooked = vi.fn()
  const user = userEvent.setup()
  render(
    <BookingFlow
      host={MOCK_HOST}
      publishableKey={MOCK_KEY}
      fetch={api.fetch}
      timezone="America/Denver"
      onBooked={onBooked}
      {...(props as object)}
    />,
  )
  return { api, user, onBooked }
}

const slotCalls = (api: MockApi) =>
  api.calls.filter((c) => c.url.pathname === '/api/v1/slots').length

async function pickDecember3At(
  user: ReturnType<typeof userEvent.setup>,
  time: string,
) {
  await user.click(
    await screen.findByRole('button', {
      name: /^Thursday, December 3, 2026, \d+ times available/,
    }),
  )
  await user.click(
    await screen.findByRole('button', { name: new RegExp(`^${time},`) }),
  )
}

describe('BookingFlow', () => {
  it('books a time: service, day and time, details, confirmation', async () => {
    const { api, user, onBooked } = setup()

    expect(await screen.findByText('Step 1 of 4')).toBeTruthy()
    await user.click(
      await screen.findByRole('button', { name: /Cut and style/ }),
    )

    expect(await screen.findByText('Step 2 of 4')).toBeTruthy()
    expect(
      await screen.findByRole('heading', { name: 'December 2026' }),
    ).toBeTruthy()
    // S8-2: Sunday and Monday are closed, struck through and disabled.
    const monday = await screen.findByRole('button', {
      name: 'Monday, December 7, 2026, no open times',
    })
    expect(monday.getAttribute('aria-disabled')).toBe('true')
    expect(monday.className).toContain('line-through')

    await pickDecember3At(user, '9:00 AM')
    const chosen = screen.getByRole('button', { name: /^9:00 AM,/ })
    expect(chosen.getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Step 3 of 4')).toBeTruthy()
    // Cut and style asks for phone and notes.
    await user.type(screen.getByLabelText('Name'), 'Alex Morgan')
    await user.type(screen.getByLabelText('Email'), 'alex@example.com')
    await user.type(screen.getByLabelText(/Phone/), '555 0100')
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(
      await screen.findByRole('heading', { name: "You're booked" }),
    ).toBeTruthy()
    expect(screen.getByText(/Thursday, December 3, 2026/)).toBeTruthy()
    expect(screen.getByText(/9:00\s*–\s*10:00\s*AM/)).toBeTruthy()
    const manage = screen.getByRole('link', { name: /Reschedule or cancel/ })
    expect(manage.getAttribute('href')).toMatch(
      /^https:\/\/slots\.example\.com\/m\//,
    )

    const post = api.calls.find((c) => c.method === 'POST')!
    expect(post.body).toEqual({
      serviceId: '64b000000000000000000002',
      start: '2026-12-03T16:00:00.000Z',
      timezone: 'America/Denver',
      customer: {
        name: 'Alex Morgan',
        email: 'alex@example.com',
        phone: '555 0100',
      },
      // The honeypot is sent, empty.
      website: '',
    })
    expect(onBooked).toHaveBeenCalledWith(
      expect.objectContaining({
        start: '2026-12-03T16:00:00.000Z',
        timezone: 'America/Denver',
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Book another' }))
    expect(await screen.findByText('Step 1 of 4')).toBeTruthy()
  })

  it('returns to the times with fresh slots when the slot was taken (S8-4)', async () => {
    const { api, user } = setup({ service: 'cut-and-style' })
    await pickDecember3At(user, '9:00 AM')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Name'), 'Alex Morgan')
    await user.type(screen.getByLabelText('Email'), 'alex@example.com')

    api.setScenario('slot_taken')
    const before = slotCalls(api)
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(
      await screen.findByText(/someone booked that time a moment ago/),
    ).toBeTruthy()
    expect(screen.getByText('Step 2 of 4')).toBeTruthy()
    await waitFor(() => expect(slotCalls(api)).toBeGreaterThan(before))
    // The same day stays chosen; the taken hour is gone from its times.
    expect(
      await screen.findByRole('button', { name: /^10:00 AM,/ }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^9:00 AM,/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()

    // What was typed survives the trip back.
    await user.click(screen.getByRole('button', { name: /^10:00 AM,/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
      'Alex Morgan',
    )
  })

  it('says plainly when the calendar is unavailable', async () => {
    setup(
      { service: 'trim' },
      createMockApi({ now: () => NOW, scenario: 'calendar_unavailable' }),
    )
    expect(await screen.findByText(/Online booking is paused/)).toBeTruthy()
    const grid = screen.getByRole('grid')
    const enabled = within(grid)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-disabled') !== 'true')
    expect(enabled).toHaveLength(0)
  })

  it('validates the details with the core schema before sending', async () => {
    const { api, user } = setup({ service: 'trim' })
    await pickDecember3At(user, '9:00 AM')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    // Trim does not ask for phone or notes.
    expect(screen.queryByLabelText(/Phone/)).toBeNull()
    expect(screen.queryByLabelText(/Notes/)).toBeNull()

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(await screen.findByText('Please enter your name.')).toBeTruthy()
    expect(screen.getByText(/Please enter an email address/)).toBeTruthy()
    const name = screen.getByLabelText('Name')
    expect(name.getAttribute('aria-invalid')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(name))
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false)

    // Fixing a field clears its error as you type.
    await user.type(name, 'Alex')
    expect(screen.queryByText('Please enter your name.')).toBeNull()
  })

  it('skips the service step when the service prop is given', async () => {
    setup({ service: 'full-color' })
    expect(await screen.findByText('Step 2 of 4')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Full color' })).toBeTruthy()
    expect(screen.queryByText('Choose a service')).toBeNull()
    // With a fixed service there is nothing to go back to.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('keeps what was typed and offers a retry when booking fails', async () => {
    const { api, user } = setup({ service: 'trim' })
    await pickDecember3At(user, '9:00 AM')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Name'), 'Alex Morgan')
    await user.type(screen.getByLabelText('Email'), 'alex@example.com')

    api.setScenario('booking_rate_limited')
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy()

    api.setScenario('booking_network_error')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/couldn't connect/)).toBeTruthy()
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
      'Alex Morgan',
    )

    api.setScenario('loaded')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', { name: "You're booked" }),
    ).toBeTruthy()
  })

  it('goes back a step at a time', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: /Trim/ }))
    await pickDecember3At(user, '9:00 AM')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Step 2 of 4')).toBeTruthy()
    // The chosen time is kept.
    expect(
      screen
        .getByRole('button', { name: /^9:00 AM,/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Choose a service')).toBeTruthy()
  })
})
