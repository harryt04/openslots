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

describe('SlotPicker props after mount', () => {
  const base = { host: MOCK_HOST, publishableKey: MOCK_KEY }
  const pressed = () =>
    screen
      .queryAllByRole('button', { pressed: true })
      .map((b) => b.getAttribute('aria-label'))

  it('clears a controlled value when the service changes', async () => {
    const api = createMockApi({ now: () => NOW })
    const onChange = vi.fn()
    const props = {
      ...base,
      fetch: api.fetch,
      timezone: 'America/Denver',
      onChange,
    }
    const value = '2026-12-03T16:00:00.000Z'
    const { rerender } = render(
      <SlotPicker {...props} service="cut-and-style" value={value} />,
    )
    await waitFor(() =>
      expect(pressed()).toEqual([expect.stringMatching(/^9:00 AM,/)]),
    )

    rerender(<SlotPicker {...props} service="trim" value={value} />)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null))
    expect(onChange).toHaveBeenCalledTimes(1)
    // Trim also offers 9:00 AM, but the old value is not shown as chosen.
    await userEvent.setup().click(
      await screen.findByRole('button', {
        name: /^Thursday, December 3, 2026, \d+ times/,
      }),
    )
    expect(
      await screen.findByRole('button', { name: /^9:00 AM,/ }),
    ).toBeTruthy()
    expect(pressed()).toEqual([])

    // Once the parent passes a value again, it is shown.
    rerender(<SlotPicker {...props} service="trim" value={null} />)
    rerender(<SlotPicker {...props} service="trim" value={value} />)
    await waitFor(() => expect(pressed()).toHaveLength(1))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('drops an uncontrolled selection when the service changes', async () => {
    const api = createMockApi({ now: () => NOW })
    const onChange = vi.fn()
    const user = userEvent.setup()
    const props = {
      ...base,
      fetch: api.fetch,
      timezone: 'America/Denver',
      onChange,
    }
    const { rerender } = render(
      <SlotPicker {...props} service="cut-and-style" />,
    )
    await user.click(
      await screen.findByRole('button', {
        name: /^Thursday, December 3, 2026, \d+ times/,
      }),
    )
    await user.click(screen.getByRole('button', { name: /^9:00 AM,/ }))
    expect(pressed()).toHaveLength(1)

    rerender(<SlotPicker {...props} service="trim" />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(null))
    expect(pressed()).toEqual([])
    expect(
      screen.getByText('Pick a highlighted day to see open times.'),
    ).toBeTruthy()
  })

  it('applies a later timezone prop and keeps the chosen instant', async () => {
    const api = createMockApi({ now: () => NOW })
    const props = { ...base, fetch: api.fetch, service: 'cut-and-style' }
    // Thursday 31 December, 4:00 PM in Denver.
    const value = '2026-12-31T23:00:00.000Z'
    const { rerender } = render(
      <SlotPicker {...props} value={value} timezone="America/Denver" />,
    )
    expect(
      await screen.findByRole('heading', { name: /Thu, Dec 31/ }),
    ).toBeTruthy()
    await waitFor(() =>
      expect(pressed()).toEqual([expect.stringMatching(/^4:00 PM,/)]),
    )

    // In Tokyo the same instant is Friday 1 January, 8:00 AM.
    rerender(<SlotPicker {...props} value={value} timezone="Asia/Tokyo" />)
    expect(
      await screen.findByRole('heading', { name: 'January 2027' }),
    ).toBeTruthy()
    expect(
      await screen.findByRole('heading', { name: /Fri, Jan 1/ }),
    ).toBeTruthy()
    await waitFor(() =>
      expect(pressed()).toEqual([
        expect.stringMatching(/^8:00 AM, Friday, January 1, 2027/),
      ]),
    )
    expect(
      (screen.getByLabelText('Times shown in') as HTMLSelectElement).value,
    ).toBe('Asia/Tokyo')
    const last = api.calls
      .filter((c) => c.url.pathname === '/api/v1/slots')
      .at(-1)!
    expect(last.url.searchParams.get('tz')).toBe('Asia/Tokyo')

    // The customer can still change it.
    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText('Times shown in'), 'America/Denver')
    expect(
      await screen.findByRole('heading', { name: /Thu, Dec 31/ }),
    ).toBeTruthy()
  })

  it('stops the months at the booking window', async () => {
    const api = createMockApi({ now: () => NOW })
    const user = userEvent.setup()
    // Cut and style books 90 days ahead: 1 March 2027 is the last day.
    render(
      <SlotPicker
        {...base}
        fetch={api.fetch}
        service="cut-and-style"
        timezone="America/Denver"
      />,
    )
    const next = await screen.findByRole('button', { name: 'Next month' })
    await waitFor(() =>
      expect((next as HTMLButtonElement).disabled).toBe(false),
    )
    for (const month of ['January 2027', 'February 2027', 'March 2027']) {
      await user.click(next)
      expect(await screen.findByRole('heading', { name: month })).toBeTruthy()
    }
    expect((next as HTMLButtonElement).disabled).toBe(true)
  })

  it('falls back to 24 months when the server sends no window', async () => {
    const api = createMockApi({ now: () => NOW })
    const noWindow: typeof fetch = async (input, init) => {
      const response = await api.fetch(input, init)
      if (!String(input).endsWith('/business')) return response
      const body = await response.json()
      for (const s of body.services) delete s.windowDays
      return new Response(JSON.stringify(body), { status: 200 })
    }
    const user = userEvent.setup()
    render(
      <SlotPicker
        {...base}
        fetch={noWindow}
        service="cut-and-style"
        timezone="America/Denver"
      />,
    )
    const next = await screen.findByRole('button', { name: 'Next month' })
    await screen.findByRole('heading', { name: 'December 2026' })
    for (let i = 0; i < 3; i++) await user.click(next)
    expect(
      await screen.findByRole('heading', { name: 'March 2027' }),
    ).toBeTruthy()
    expect((next as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('SlotPicker on a daylight-saving fall-back day', () => {
  // Sunday 1 November 2026: Denver's 1:00 to 2:00 AM happens twice.
  const FIRST = '2026-11-01T07:30:00.000Z' // 1:30 AM MDT
  const SECOND = '2026-11-01T08:30:00.000Z' // 1:30 AM MST
  const LATER = '2026-11-01T16:00:00.000Z' // 9:00 AM MST
  const service = { ...MOCK_SERVICES[0]!, windowDays: undefined }
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    const body = url.pathname.endsWith('/business')
      ? {
          name: 'Night Owl',
          slug: 'night-owl',
          timezone: 'America/Denver',
          services: [service],
        }
      : {
          timezone: 'America/Denver',
          days:
            url.searchParams.get('from')! <= '2026-11-01' &&
            url.searchParams.get('to')! >= '2026-11-01'
              ? { '2026-11-01': [FIRST, SECOND, LATER] }
              : {},
        }
    return new Response(JSON.stringify(body), { status: 200 })
  }

  it('adds the zone to repeated times, on screen and when read out', async () => {
    vi.setSystemTime(new Date('2026-10-30T12:00:00Z'))
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <SlotPicker
        host={MOCK_HOST}
        publishableKey={MOCK_KEY}
        fetch={fetch}
        service={service.id}
        timezone="America/Denver"
        onChange={onChange}
      />,
    )
    await user.click(
      await screen.findByRole('button', {
        name: /^Sunday, November 1, 2026, 3 times available/,
      }),
    )
    const first = screen.getByRole('button', { name: /^1:30 AM MDT, Sunday/ })
    const second = screen.getByRole('button', { name: /^1:30 AM MST, Sunday/ })
    expect(first.textContent).toBe('1:30 AM MDT')
    expect(second.textContent).toBe('1:30 AM MST')
    // A time that happens once keeps its plain label.
    expect(
      screen.getByRole('button', { name: /^9:00 AM, Sunday/ }).textContent,
    ).toBe('9:00 AM')
    await user.click(second)
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ start: SECOND }),
    )
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
