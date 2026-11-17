import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ServiceList, SlotPicker, useSlots } from '../src'
import {
  createMockApi,
  MOCK_HOST,
  MOCK_KEY,
  MOCK_SERVICES,
} from '../src/testing'

const NOW = new Date('2026-12-01T08:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
})

function renderPicker(timezone = 'America/Denver', onChange = vi.fn()) {
  const api = createMockApi({ now: () => NOW })
  render(
    <SlotPicker
      host={MOCK_HOST}
      publishableKey={MOCK_KEY}
      fetch={api.fetch}
      service="cut-and-style"
      timezone={timezone}
      onChange={onChange}
    />,
  )
  return { api, onChange, user: userEvent.setup() }
}

const focused = () => document.activeElement?.getAttribute('aria-label') ?? ''

describe('SlotPicker', () => {
  it('moves through the day grid with the keyboard (S8-6)', async () => {
    const { user } = renderPicker()
    const dec3 = await screen.findByRole('button', {
      name: /^Thursday, December 3, 2026, \d+ times/,
    })
    // One tab stop: the first open day.
    expect(
      screen.getByRole('button', { name: /^Tuesday, December 1,/ }).tabIndex,
    ).toBe(0)
    expect(dec3.tabIndex).toBe(-1)

    screen.getByRole('button', { name: /^Tuesday, December 1,/ }).focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(focused()).toMatch(/^Thursday, December 3/)
    await user.keyboard('{ArrowDown}')
    expect(focused()).toMatch(/^Thursday, December 10/)
    await user.keyboard('{Home}')
    expect(focused()).toMatch(/^Sunday, December 6/)
    await user.keyboard('{End}')
    expect(focused()).toMatch(/^Saturday, December 12/)
    await user.keyboard('{ArrowUp}')
    expect(focused()).toMatch(/^Saturday, December 5/)
    // Before this month is out of reach.
    await user.keyboard('{PageUp}')
    expect(focused()).toMatch(/^Tuesday, December 1/)

    await user.keyboard('{PageDown}')
    expect(
      await screen.findByRole('heading', { name: 'January 2027' }),
    ).toBeTruthy()
    await waitFor(() => expect(focused()).toMatch(/^Friday, January 1, 2027/))
    await user.keyboard('{ArrowLeft}')
    expect(
      await screen.findByRole('heading', { name: 'December 2026' }),
    ).toBeTruthy()
    await waitFor(() => expect(focused()).toMatch(/^Thursday, December 31/))

    // Enter picks the focused day; closed days cannot be picked.
    await user.keyboard('{Enter}')
    expect(
      await screen.findByRole('heading', { name: /Thu, Dec 31/ }),
    ).toBeTruthy()
    const gridcell = document.activeElement!.closest('[role="gridcell"]')!
    expect(gridcell.getAttribute('aria-selected')).toBe('true')
  })

  it('reports the chosen slot with its end and timezone', async () => {
    const { user, onChange } = renderPicker()
    await user.click(
      await screen.findByRole('button', {
        name: /^Thursday, December 3, 2026, \d+ times/,
      }),
    )
    await user.click(screen.getByRole('button', { name: /^9:00 AM,/ }))
    expect(onChange).toHaveBeenLastCalledWith({
      start: '2026-12-03T16:00:00.000Z',
      end: '2026-12-03T17:00:00.000Z',
      date: '2026-12-03',
      timezone: 'America/Denver',
    })
  })

  it('shows times in the customer timezone when it is a day ahead (S8-3)', async () => {
    const { api, user, onChange } = renderPicker('Pacific/Auckland')
    // Denver's Thursday 9:00 AM is Friday 5:00 AM in Auckland.
    const dec4 = await screen.findByRole('button', {
      name: /^Friday, December 4, 2026, \d+ times available/,
    })
    // Denver opens Tuesday the 1st, which is already the 2nd in Auckland.
    expect(
      screen.getByRole('button', {
        name: 'Tuesday, December 1, 2026, no open times',
      }),
    ).toBeTruthy()
    expect(screen.getByText('The business is in Mountain Time.')).toBeTruthy()

    await user.click(dec4)
    await user.click(screen.getByRole('button', { name: /^5:00 AM,/ }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        start: '2026-12-03T16:00:00.000Z',
        date: '2026-12-04',
        timezone: 'Pacific/Auckland',
      }),
    )
    const query = api.calls.find((c) => c.url.pathname === '/api/v1/slots')!.url
      .searchParams
    expect(query.get('tz')).toBe('Pacific/Auckland')
    expect(query.get('from')).toBe('2026-12-01')
    expect(query.get('to')).toBe('2026-12-31')
  })

  it('lets the customer change timezone', async () => {
    const { user } = renderPicker()
    await screen.findByRole('button', {
      name: /^Thursday, December 3, 2026, \d+ times/,
    })
    expect(screen.queryByText(/The business is in/)).toBeNull()
    await user.selectOptions(
      screen.getByLabelText('Times shown in'),
      'Europe/London',
    )
    expect(
      await screen.findByText('The business is in Mountain Time.'),
    ).toBeTruthy()
    await user.click(
      await screen.findByRole('button', {
        name: /^Thursday, December 3, 2026, \d+ times/,
      }),
    )
    // 9:00 AM in Denver is 4:00 PM in London.
    expect(
      await screen.findByRole('button', { name: /^4:00 PM,/ }),
    ).toBeTruthy()
  })
})

describe('ServiceList', () => {
  it('lists active services with durations', async () => {
    const api = createMockApi({ now: () => NOW })
    const onSelect = vi.fn()
    render(
      <ServiceList
        host={MOCK_HOST}
        publishableKey={MOCK_KEY}
        fetch={api.fetch}
        onSelect={onSelect}
      />,
    )
    const color = await screen.findByRole('button', { name: /Full color/ })
    expect(color.textContent).toContain('180 min')
    await userEvent.setup().click(color)
    expect(onSelect).toHaveBeenCalledWith(MOCK_SERVICES[2])
  })
})

describe('useSlots', () => {
  it('never applies a response for inputs that have changed', async () => {
    const resolvers: ((r: Response) => void)[] = []
    const fetch = vi.fn<typeof globalThis.fetch>(
      () => new Promise<Response>((resolve) => resolvers.push(resolve)),
    )
    function Probe({ from }: { from: string }) {
      const slots = useSlots({
        host: MOCK_HOST,
        publishableKey: MOCK_KEY,
        fetch,
        service: MOCK_SERVICES[0]!.id,
        from,
        to: from,
      })
      return (
        <p>
          {slots.loading
            ? 'loading'
            : Object.keys(slots.data?.days ?? {}).join(',')}
        </p>
      )
    }
    const reply = (date: string) =>
      new Response(
        JSON.stringify({
          timezone: 'America/Denver',
          days: { [date]: [`${date}T16:00:00Z`] },
        }),
        { status: 200 },
      )
    const { rerender } = render(<Probe from="2026-12-03" />)
    rerender(<Probe from="2026-12-04" />)
    await waitFor(() => expect(resolvers).toHaveLength(2))
    resolvers[1]!(reply('2026-12-04'))
    expect(await screen.findByText('2026-12-04')).toBeTruthy()
    // The first, stale request answers late; it must be ignored.
    resolvers[0]!(reply('2026-12-03'))
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByText('2026-12-04')).toBeTruthy()
  })
})
