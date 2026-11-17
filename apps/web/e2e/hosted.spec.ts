import {
  expect as baseExpect,
  test,
  type Browser,
  type Page,
} from '@playwright/test'

import {
  calendarState,
  chooseTime,
  createSalon,
  fillDetails,
  openDay,
  readyGrid,
} from './support/salon'

/*
 * The hosted booking page (/b/...) and the manage page (/m/...), used the way
 * a customer would: no sign-in, in a browser context of their own, with the
 * owner's setup done through the real admin screens.
 */
const expect = baseExpect.configure({ timeout: 20_000 })
test.slow()

const SERVICES = [
  { name: 'Trim', minutes: 30 },
  { name: 'Cut and style', minutes: 60 },
  { name: 'Full color', minutes: 180 },
]

async function customer(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  const outside: string[] = []
  // TRD section 9: nothing on a customer page talks to another host.
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!['http:', 'https:'].includes(url.protocol)) return
    // PostHog is proxied through this origin at /ingest, so a request there
    // is tracking even though it never leaves the host.
    if (
      url.host !== new URL(baseURL ?? 'http://localhost').host ||
      url.pathname.startsWith('/ingest')
    ) {
      outside.push(request.url())
    }
  })
  return { context, page, outside }
}

const flow = (page: Page) => page.locator('.openslots').first()

/** Books Cut and style through the hosted page; returns the manage URL. */
async function bookCutAndStyle(
  page: Page,
  slug: string,
  who: { name: string; email: string },
  index = 0,
) {
  await page.goto(`/b/${slug}/cut-and-style`)
  const label = await chooseTime(flow(page), index)
  await flow(page).getByRole('button', { name: 'Continue' }).click()
  await fillDetails(flow(page), who)
  await flow(page).getByRole('button', { name: 'Confirm booking' }).click()
  await expect(
    flow(page).getByRole('heading', { name: "You're booked" }),
  ).toBeVisible()
  const manageUrl = await flow(page)
    .getByRole('link', { name: /Reschedule or cancel/ })
    .getAttribute('href')
  return { label, manageUrl: manageUrl! }
}

test('books with the keyboard alone; the event reaches the calendar (S8-1, S8-5, S8-6)', async ({
  page,
  browser,
  baseURL,
}) => {
  const salon = await createSalon(page, { services: SERVICES })
  const guest = await customer(browser, baseURL)
  const c = guest.page
  await c.goto(`/b/${salon.slug}`)
  await expect(
    c.getByRole('heading', { name: 'Choose a service' }),
  ).toBeVisible()
  await expect(c).toHaveTitle(/Book with Shear Bliss/)
  // No signed-in chrome on a customer page.
  await expect(c.getByRole('navigation')).toHaveCount(0)
  await expect(c.getByText('Powered by OpenSlots')).toBeVisible()

  const active = () =>
    c.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return {
        text: el?.textContent?.trim() ?? '',
        date: el?.dataset.date ?? '',
        disabled: el?.getAttribute('aria-disabled') === 'true',
        pressed: el?.getAttribute('aria-pressed'),
        name: el?.getAttribute('name') ?? '',
        ring: el ? getComputedStyle(el).outlineWidth : '',
      }
    })
  async function tabUntil(
    match: (a: Awaited<ReturnType<typeof active>>) => boolean,
  ) {
    for (let i = 0; i < 30; i++) {
      await c.keyboard.press('Tab')
      if (match(await active())) return
    }
    throw new Error('focus never reached the target')
  }

  await tabUntil((a) => a.text.startsWith('Cut and style'))
  // T-6: the focused control has the 2px ring.
  expect((await active()).ring).toBe('2px')
  await c.keyboard.press('Enter')
  await expect(flow(c).getByText('Step 2 of 4')).toBeVisible()
  await readyGrid(flow(c))
  await tabUntil((a) => a.date !== '')
  for (let i = 0; i < 70 && (await active()).disabled; i++) {
    await c.keyboard.press('ArrowRight')
    await readyGrid(flow(c))
  }
  expect((await active()).disabled).toBe(false)
  await c.keyboard.press('Enter')
  await tabUntil((a) => a.pressed === 'false')
  await c.keyboard.press('Enter')
  expect((await active()).pressed).toBe('true')
  await tabUntil((a) => a.text.startsWith('Continue'))
  await c.keyboard.press('Enter')
  await expect(flow(c).getByText('Step 3 of 4')).toBeVisible()
  await tabUntil((a) => a.name === 'name')
  await c.keyboard.type('Priya Nair')
  await c.keyboard.press('Tab')
  await c.keyboard.type('priya@example.test')
  await tabUntil((a) => a.text === 'Confirm booking')
  await c.keyboard.press('Enter')
  await expect(
    flow(c).getByRole('heading', { name: "You're booked" }),
  ).toBeFocused()
  await expect(
    flow(c).getByRole('link', { name: /Reschedule or cancel/ }),
  ).toHaveAttribute('href', /\/m\/[A-Za-z0-9_-]{43}$/)

  // S8-5: the event exists, with the customer as a guest.
  const state = await calendarState(page, salon.accountId)
  const events = Object.values(state.events)
  expect(events).toHaveLength(1)
  expect(events[0]?.event.attendees.map((a) => a.email)).toContain(
    'priya@example.test',
  )
  expect(guest.outside).toEqual([])
  await guest.context.close()
})

test('two customers, one time: the second is told it is gone and sees fresh times (S8-4)', async ({
  page,
  browser,
  baseURL,
}) => {
  const salon = await createSalon(page, { services: SERVICES })
  const first = await customer(browser, baseURL)
  const second = await customer(browser, baseURL)

  await second.page.goto(`/b/${salon.slug}/cut-and-style`)
  const label = await chooseTime(flow(second.page), 0)
  await flow(second.page).getByRole('button', { name: 'Continue' }).click()
  await fillDetails(flow(second.page), {
    name: 'Second Person',
    email: 'second@example.test',
  })

  await first.page.goto(`/b/${salon.slug}/cut-and-style`)
  expect(await chooseTime(flow(first.page), 0)).toBe(label)
  await flow(first.page).getByRole('button', { name: 'Continue' }).click()
  await fillDetails(flow(first.page), {
    name: 'First Person',
    email: 'first@example.test',
  })

  const results = await Promise.all(
    [first, second].map(async (guest) => {
      const response = guest.page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname === '/api/v1/bookings',
      )
      await flow(guest.page)
        .getByRole('button', { name: 'Confirm booking' })
        .click()
      return (await response).status()
    }),
  )
  expect(results.filter((status) => status === 201)).toHaveLength(1)
  expect(results.filter((status) => status === 409)).toHaveLength(1)
  const loser = results[0] === 409 ? first : second
  const winner = results[0] === 201 ? first : second
  await expect(
    flow(winner.page).getByRole('heading', { name: "You're booked" }),
  ).toBeVisible()
  await expect(
    flow(loser.page).getByText(/someone booked that time a moment ago/i),
  ).toBeVisible()
  // Back on the time step, with fresh times: the taken one is gone.
  await expect(flow(loser.page).getByText('Step 2 of 4')).toBeVisible()
  await readyGrid(flow(loser.page))
  const times = flow(loser.page).getByRole('group').getByRole('button')
  await expect(times.first()).toBeVisible()
  expect(await times.allInnerTexts()).not.toContain(label)

  const events = Object.values(
    (await calendarState(page, salon.accountId)).events,
  )
  expect(events).toHaveLength(1)
  await first.context.close()
  await second.context.close()
})

test('a direct service link skips the service step; paused and unknown links are not found', async ({
  page,
  browser,
  baseURL,
}) => {
  const salon = await createSalon(page, { services: SERVICES })
  const guest = await customer(browser, baseURL)
  const c = guest.page

  await c.goto(`/b/${salon.slug}/full-color`)
  await expect(c.getByText('Step 2 of 4')).toBeVisible()
  await expect(
    c.getByRole('heading', { name: 'Full color', exact: true }),
  ).toBeVisible()
  await expect(c).toHaveTitle(/Full color with Shear Bliss/)
  // Fixed service: there is no Back to a service list.
  await expect(c.getByRole('button', { name: 'Back' })).toHaveCount(0)

  // Pause the service in the admin screen; its link is then not found.
  await page.goto('/services')
  await page
    .getByTestId('service-card')
    .filter({ hasText: 'Full color' })
    .getByRole('switch', { name: 'Bookable: Full color' })
    .click()
  await expect(page.locator('[data-status="paused"]')).toBeVisible()
  await expect
    .poll(async () =>
      (await c.request.get(`/b/${salon.slug}/full-color`)).status(),
    )
    .toBe(404)
  const paused = await c.goto(`/b/${salon.slug}/full-color`)
  expect(paused?.status()).toBe(404)
  await expect(
    c.getByRole('heading', { name: /isn.t available/ }),
  ).toBeVisible()

  // An unknown service and an unknown business look the same.
  const unknownService = await c.goto(`/b/${salon.slug}/nope`)
  expect(unknownService?.status()).toBe(404)
  const unknownBusiness = await c.goto('/b/no-such-business')
  expect(unknownBusiness?.status()).toBe(404)
  await expect(
    c.getByRole('heading', { name: /isn.t available/ }),
  ).toBeVisible()
  // The Services page's copy-link targets exist for active services.
  const trim = await c.goto(`/b/${salon.slug}/trim`)
  expect(trim?.status()).toBe(200)
  const home = await c.goto(`/b/${salon.slug}`)
  expect(home?.status()).toBe(200)
  await guest.context.close()
})

test('reschedule moves the event; the overlap and cancel rules are plain (S10-1, S10-2)', async ({
  page,
  browser,
  baseURL,
}) => {
  const salon = await createSalon(page, { services: SERVICES })
  const guest = await customer(browser, baseURL)
  const c = guest.page
  const booked = await bookCutAndStyle(c, salon.slug, {
    name: 'Priya Nair',
    email: 'priya@example.test',
  })

  // S10-1: reached by the token alone.
  const manage = await c.goto(booked.manageUrl)
  expect(manage?.status()).toBe(200)
  expect(manage?.headers()['cache-control']).toContain('no-store')
  expect(manage?.headers()['referrer-policy']).toBe('no-referrer')
  expect(manage?.headers()['x-content-type-options']).toBe('nosniff')
  expect(manage?.headers()['x-robots-tag']).toContain('noindex')
  await expect(c.locator('meta[name=robots]')).toHaveAttribute(
    'content',
    /noindex/,
  )
  await expect(c.getByText('Confirmed', { exact: true })).toBeVisible()
  await expect(
    c.getByRole('heading', { name: 'Cut and style with Shear Bliss' }),
  ).toBeVisible()
  await expect(c.getByText(/\bTime\b/).first()).toBeVisible()
  const before = Object.values(
    (await calendarState(page, salon.accountId)).events,
  )[0]?.event.start.dateTime

  // The picker never offers a time that overlaps the booking itself, so the
  // refusals are answered by the API for a stale page; the page must show
  // each one plainly and take the customer to the right step.
  const refuse = (code: string, status: number, message: string) =>
    c.route(
      '**/api/v1/manage/*/reschedule',
      (route) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ error: { code, message } }),
        }),
      { times: 1 },
    )
  await c.getByRole('button', { name: 'Reschedule' }).click()
  await expect(
    c.getByRole('heading', { name: 'Choose a new time' }),
  ).toBeVisible()
  const picker = c.locator('.openslots')
  const pickAndConfirm = async (index: number) => {
    await chooseTime(picker, index)
    await c.getByRole('button', { name: 'Continue' }).click()
    await expect(
      c.getByRole('heading', { name: 'Confirm your new time' }),
    ).toBeVisible()
    await c.getByRole('button', { name: 'Confirm new time' }).click()
  }

  await refuse(
    'booking_not_changeable',
    409,
    'Pick a time that does not overlap your current booking, or cancel and book again.',
  )
  await pickAndConfirm(3)
  await expect(c.getByTestId('problem')).toContainText(
    'does not overlap your current booking',
  )
  await expect(
    c.getByRole('heading', { name: 'Choose a new time' }),
  ).toBeVisible()

  // "Try again in a moment" stays on the confirmation so it can be retried.
  await refuse('slot_taken', 409, 'Try again in a moment.')
  await pickAndConfirm(3)
  await expect(c.getByTestId('problem')).toContainText('Try again in a moment.')
  await expect(
    c.getByRole('heading', { name: 'Confirm your new time' }),
  ).toBeVisible()

  // A time taken meanwhile: back to fresh times with a plain message.
  await refuse('slot_taken', 409, 'slot taken')
  await c.getByRole('button', { name: 'Confirm new time' }).click()
  await expect(c.getByTestId('problem')).toContainText(
    'someone booked that time a moment ago',
  )
  await expect(
    c.getByRole('heading', { name: 'Choose a new time' }),
  ).toBeVisible()

  // The calendar is unavailable: said plainly, with the way back.
  await refuse('calendar_unavailable', 502, 'calendar unavailable')
  await pickAndConfirm(3)
  await expect(c.getByTestId('problem')).toContainText(
    "calendar can't be reached",
  )

  // A later time works (S10-2): confirm, then the new time is shown.
  await c.getByRole('button', { name: 'Confirm new time' }).click()
  await expect(c.getByText('Your booking has moved')).toBeVisible()
  await expect(c.getByRole('button', { name: 'Reschedule' })).toBeVisible()
  const after = Object.values(
    (await calendarState(page, salon.accountId)).events,
  )
  expect(after).toHaveLength(1)
  expect(after[0]?.event.start.dateTime).not.toBe(before)
  expect(guest.outside).toEqual([])
  await guest.context.close()
})

test('cancel asks first, removes the event and frees the time for someone else', async ({
  page,
  browser,
  baseURL,
}) => {
  const salon = await createSalon(page, { services: SERVICES })
  const first = await customer(browser, baseURL)
  const second = await customer(browser, baseURL)
  const booked = await bookCutAndStyle(first.page, salon.slug, {
    name: 'Priya Nair',
    email: 'priya@example.test',
  })
  const c = first.page
  await c.goto(booked.manageUrl)
  await c.getByRole('button', { name: 'Cancel booking' }).click()
  const dialog = c.getByRole('alertdialog')
  await expect(dialog).toContainText('Cancel this booking?')
  // Keeping the booking changes nothing.
  await dialog.getByRole('button', { name: 'Keep booking' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(c.getByRole('button', { name: 'Cancel booking' })).toBeFocused()
  expect(
    Object.values((await calendarState(page, salon.accountId)).events),
  ).toHaveLength(1)

  await c.getByRole('button', { name: 'Cancel booking' }).click()
  await c.getByRole('button', { name: 'Yes, cancel booking' }).click()
  await expect(c.getByText('This booking is cancelled')).toBeVisible()
  await expect(c.locator('[data-status="cancelled"]')).toBeVisible()
  await expect(c.getByRole('link', { name: 'Book again' })).toHaveAttribute(
    'href',
    `/b/${salon.slug}`,
  )
  await expect
    .poll(
      async () =>
        Object.values((await calendarState(page, salon.accountId)).events)
          .length,
    )
    .toBe(0)

  // The same time is open again for a second customer.
  await second.page.goto(`/b/${salon.slug}/cut-and-style`)
  await (await openDay(flow(second.page))).click()
  const times = await flow(second.page)
    .getByRole('group')
    .getByRole('button')
    .allInnerTexts()
  expect(times.map((t) => t.trim())).toContain(booked.label)
  await first.context.close()
  await second.context.close()
})

test('a bad token gets one uniform not-found page', async ({
  browser,
  baseURL,
}) => {
  const guest = await customer(browser, baseURL)
  for (const token of ['x'.repeat(43), 'short', 'not.a.token']) {
    const response = await guest.page.goto(`/m/${token}`)
    expect(response?.status()).toBe(404)
    await expect(
      guest.page.getByRole('heading', { name: /find that booking/ }),
    ).toBeVisible()
  }
  await guest.context.close()
})

test('with the calendar connection broken, no times are offered and it says so', async ({
  page,
  browser,
  baseURL,
}) => {
  const salon = await createSalon(page, { services: SERVICES })
  const response = await page.request.post('/dev/calendar', {
    data: { email: salon.accountEmail, authFailure: true },
  })
  expect(response.ok()).toBe(true)
  const guest = await customer(browser, baseURL)
  await guest.page.goto(`/b/${salon.slug}/cut-and-style`)
  await expect(flow(guest.page).locator('[role=grid]')).toHaveAttribute(
    'data-state',
    'unavailable',
  )
  await expect(
    flow(guest.page)
      .getByText(/calendar can.t be reached|paused/i)
      .first(),
  ).toBeVisible()
  await expect(
    flow(guest.page).locator('button[data-date]:not([aria-disabled])'),
  ).toHaveCount(0)
  await guest.context.close()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`the page follows the visitor's ${scheme} preference, wholly (T-4)`, async ({
    page,
    browser,
    baseURL,
  }) => {
    const salon = await createSalon(page, { services: SERVICES })
    const context = await browser.newContext({ baseURL, colorScheme: scheme })
    const c = await context.newPage()
    await c.goto(`/b/${salon.slug}`)
    await expect(
      c.getByRole('heading', { name: 'Choose a service' }),
    ).toBeVisible()
    const colors = await c.evaluate(() => {
      const bg = (el: Element | null) =>
        el ? getComputedStyle(el).backgroundColor : ''
      return {
        dark: document.documentElement.classList.contains('dark'),
        page: bg(document.body),
        card: bg(document.querySelector('.openslots > div')),
      }
    })
    expect(colors.dark).toBe(scheme === 'dark')
    // Both come from the same tokens, so the page and card agree on a scheme:
    // dark means neither is white, light means the card is.
    if (scheme === 'dark') {
      expect(colors.card).toBe('rgb(20, 17, 39)')
      expect(colors.page).not.toBe('rgb(255, 255, 255)')
    } else {
      expect(colors.card).toBe('rgb(255, 255, 255)')
    }
    await context.close()
  })
}

test('stacks on a 390px phone and every tab stop shows the 2px focus ring (S9, T-6)', async ({
  page,
  browser,
  baseURL,
}) => {
  const salon = await createSalon(page, { services: SERVICES })
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  })
  const c = await context.newPage()
  await c.goto(`/b/${salon.slug}/cut-and-style`)
  const grid = c.locator('[data-step=time] > div').first()
  await expect(grid).toBeVisible()
  expect(
    await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
    ),
  ).toBe(1)
  // No sideways scrolling on a phone.
  expect(
    await c.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)

  await readyGrid(flow(c))
  await (await openDay(flow(c))).click()
  // Tab through the page: each focused control shows a 2px outline.
  const seen: string[] = []
  await c.locator('body').click({ position: { x: 1, y: 1 } })
  for (let i = 0; i < 12; i++) {
    await c.keyboard.press('Tab')
    const info = await c.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const style = getComputedStyle(el)
      return {
        tag: el.tagName,
        label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
        width: style.outlineWidth,
        style: style.outlineStyle,
      }
    })
    if (info.tag === 'BODY') continue
    seen.push(info.label)
    expect(info.style, info.label).toBe('solid')
    expect(info.width, info.label).toBe('2px')
  }
  expect(seen.length).toBeGreaterThan(5)
  await context.close()
})
