import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BookingFlow } from '../src'
import { safeManageUrl } from '../src/components/booking-flow'
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
    await user.type(screen.getByLabelText('Phone'), '303 555 0100')

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

  it('requires the phone when the service asks for it; notes stay optional', async () => {
    const { api, user } = setup({ service: 'cut-and-style' })
    await pickDecember3At(user, '9:00 AM')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    // S8: Phone has no "optional" marker, Notes does.
    const phone = screen.getByLabelText('Phone')
    expect(phone.hasAttribute('required')).toBe(true)
    expect(screen.getByText('Notes').textContent).toMatch(/optional/)
    expect(screen.getByText('Phone').textContent).not.toMatch(/optional/)

    await user.type(screen.getByLabelText('Name'), 'Alex Morgan')
    await user.type(screen.getByLabelText('Email'), 'alex@example.com')
    await user.type(phone, '   ')
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))
    expect(await screen.findByText('Please enter a phone number.')).toBeTruthy()
    expect(phone.getAttribute('aria-invalid')).toBe('true')
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false)

    await user.type(phone, '303 555 0100')
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))
    expect(
      await screen.findByRole('heading', { name: "You're booked" }),
    ).toBeTruthy()
    const post = api.calls.find((c) => c.method === 'POST')!
    expect((post.body as { customer: unknown }).customer).toEqual({
      name: 'Alex Morgan',
      email: 'alex@example.com',
      phone: '303 555 0100',
    })
  })

  it('sends one request for a rapid double submit', async () => {
    const api = createMockApi({ now: () => NOW })
    const gate = gated(api)
    const { user } = setup({ service: 'trim', fetch: gate.fetch }, api)
    await pickDecember3At(user, '9:00 AM')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Name'), 'Alex Morgan')
    await user.type(screen.getByLabelText('Email'), 'alex@example.com')

    const form = screen
      .getByRole('button', { name: 'Confirm booking' })
      .closest('form')!
    // Two submits in the same tick, before React re-renders.
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    await act(async () => gate.release())
    expect(
      await screen.findByRole('heading', { name: "You're booked" }),
    ).toBeTruthy()
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })

  it('locks the journey while booking and confirms what was submitted', async () => {
    const api = createMockApi({ now: () => NOW })
    const gate = gated(api)
    const { user, onBooked } = setup({ fetch: gate.fetch }, api)
    await user.click(await screen.findByRole('button', { name: /Trim/ }))
    await pickDecember3At(user, '9:00 AM')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Name'), 'Alex Morgan')
    await user.type(screen.getByLabelText('Email'), 'alex@example.com')
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    // In flight: Back is disabled and does nothing.
    const back = screen.getByRole('button', { name: 'Back' })
    expect((back as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(back)
    expect(screen.getByText('Step 3 of 4')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Booking/ })).toBeTruthy()

    await act(async () => gate.release())
    expect(
      await screen.findByRole('heading', { name: "You're booked" }),
    ).toBeTruthy()
    expect(screen.getByText('Trim with Shear Bliss Salon')).toBeTruthy()
    expect(onBooked).toHaveBeenCalledTimes(1)
  })

  it('confirms the submitted service even if the host changes it meanwhile', async () => {
    const api = createMockApi({ now: () => NOW })
    const gate = gated(api)
    const onBooked = vi.fn()
    const user = userEvent.setup()
    const props = {
      host: MOCK_HOST,
      publishableKey: MOCK_KEY,
      fetch: gate.fetch,
      timezone: 'America/Denver',
      onBooked,
    }
    const { rerender } = render(<BookingFlow {...props} service="trim" />)
    await pickDecember3At(user, '9:00 AM')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Name'), 'Alex Morgan')
    await user.type(screen.getByLabelText('Email'), 'alex@example.com')
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    rerender(<BookingFlow {...props} service="full-color" />)
    expect(await screen.findByText('Step 2 of 4')).toBeTruthy()

    await act(async () => gate.release())
    expect(
      await screen.findByRole('heading', { name: "You're booked" }),
    ).toBeTruthy()
    expect(screen.getByText('Trim with Shear Bliss Salon')).toBeTruthy()
    expect(screen.getByText(/9:00\s*–\s*9:30\s*AM/)).toBeTruthy()
    expect(onBooked).toHaveBeenCalledWith(
      expect.objectContaining({
        service: expect.objectContaining({ slug: 'trim' }),
      }),
    )
  })

  it('clears the chosen time when the service prop changes', async () => {
    const api = createMockApi({ now: () => NOW })
    const user = userEvent.setup()
    const props = {
      host: MOCK_HOST,
      publishableKey: MOCK_KEY,
      fetch: api.fetch,
      timezone: 'America/Denver',
    }
    const { rerender } = render(<BookingFlow {...props} service="trim" />)
    await pickDecember3At(user, '9:30 AM')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Step 3 of 4')).toBeTruthy()

    rerender(<BookingFlow {...props} service="full-color" />)
    expect(await screen.findByText('Step 2 of 4')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Full color' })).toBeTruthy()
    // No time from Trim's availability survives, and nothing to continue.
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(screen.queryByRole('button', { pressed: true })).toBeNull()
    expect(screen.queryByText(/9:30 AM/)).toBeNull()

    // Same service by id instead of slug: nothing is reset.
    await pickDecember3At(user, '9:00 AM')
    rerender(<BookingFlow {...props} service="64b000000000000000000003" />)
    expect(
      screen
        .getByRole('button', { name: /^9:00 AM,/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('shows no link for a manage URL that is not http(s)', async () => {
    const api = createMockApi({ now: () => NOW })
    const evil: typeof fetch = async (input, init) => {
      const response = await api.fetch(input, init)
      if (init?.method !== 'POST') return response
      const body = await response.json()
      return new Response(
        JSON.stringify({ ...body, manageUrl: 'javascript:alert(1)' }),
        { status: response.status, headers: response.headers },
      )
    }
    const { user } = setup({ service: 'trim', fetch: evil }, api)
    await pickDecember3At(user, '9:00 AM')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Name'), 'Alex Morgan')
    await user.type(screen.getByLabelText('Email'), 'alex@example.com')
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(
      await screen.findByRole('heading', { name: "You're booked" }),
    ).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(document.querySelector('a[href^="javascript"]')).toBeNull()
    expect(
      screen.getByText(/link to reschedule or cancel isn't available/),
    ).toBeTruthy()
  })
})

describe('safeManageUrl', () => {
  it('keeps http and https URLs only', () => {
    expect(safeManageUrl('https://slots.example.com/m/abc')).toBe(
      'https://slots.example.com/m/abc',
    )
    expect(safeManageUrl('http://localhost:3000/m/abc')).toBe(
      'http://localhost:3000/m/abc',
    )
    for (const bad of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:x',
      '/m/abc',
      'not a url',
    ]) {
      expect(safeManageUrl(bad), bad).toBeNull()
    }
  })
})

/** Holds `POST` requests until `release` is called. */
function gated(api: MockApi) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (init?.method === 'POST') await gate
    return api.fetch(input, init)
  }
  return { fetch, release }
}
