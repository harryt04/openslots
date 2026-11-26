import { expect } from '@playwright/test'
import { test } from './support/privacy'
import {
  calendarState,
  chooseTime,
  createSalon,
  fillDetails,
  openDay,
} from './support/salon'

test('owner setup follows visible navigation to a working booking link', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const salon = await createSalon(page, {
    name: 'Shear Bliss Salon',
    services: [{ name: 'Trim', minutes: 30 }],
  })
  await page.getByRole('link', { name: /^Availability/ }).click()
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
    await page.getByLabel(`${day} start`, { exact: true }).fill('10 AM')
    await page.getByLabel(`${day} end`, { exact: true }).fill('12 PM')
  }
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Availability saved.').first()).toBeVisible()
  await page.getByRole('link', { name: /^Bookings(?: \d+)?$/ }).click()
  await page
    .getByRole('button', { name: 'Copy booking link', exact: true })
    .click()
  const url = await page.evaluate(() => navigator.clipboard.readText())
  expect(new URL(url).pathname).toBe(`/b/${salon.slug}`)
  await page.goto(url)
  await page.getByRole('button', { name: /Trim/ }).click()
  const scope = page.locator('.openslots')
  await scope.getByRole('combobox').selectOption('America/Denver')
  await (await openDay(scope)).click()
  const labels = await scope
    .getByRole('group')
    .getByRole('button')
    .allTextContents()
  expect(labels.length).toBeGreaterThan(0)
  for (const label of labels) expect(label.trim()).toMatch(/^(10|11):[03]0 AM$/)
})

test('connection failure withholds customer times until owner reconnects and booking succeeds', async ({
  page,
  browser,
  baseURL,
}) => {
  const salon = await createSalon(page, { services: [{ name: 'Trim' }] })
  const guest = await browser.newContext({ baseURL })
  try {
    const customer = await guest.newPage()
    expect(
      (
        await page.request.post('/dev/calendar', {
          data: { email: salon.accountEmail, authFailure: true },
        })
      ).ok(),
    ).toBe(true)
    await page.getByRole('link', { name: /^Calendars/ }).click()
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(
      page.getByText('Needs reconnect', { exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Needs attention')).toBeVisible()
    await page.getByRole('link', { name: /^Bookings(?: \d+)?$/ }).click()
    await expect(
      page.getByRole('link', {
        name: /(?:Calendar connection needs attention|No booking calendar).*Review calendars/,
      }),
    ).toBeVisible()
    await customer.goto(`/b/${salon.slug}/trim`)
    await expect(
      customer.getByText(/Online booking is paused/i).first(),
    ).toBeVisible()
    expect(
      await customer.locator('[data-date]:not([aria-disabled])').count(),
    ).toBe(0)
    await page.getByRole('link', { name: /^Calendars/ }).click()
    await page.getByRole('button', { name: 'Reconnect', exact: true }).click()
    await page.waitForURL(/\/calendars\?notice=/)
    await expect(page.getByText('Connected', { exact: true })).toBeVisible()
    await customer.reload()
    const scope = customer.locator('.openslots')
    await chooseTime(scope)
    await scope.getByRole('button', { name: 'Continue' }).click()
    await fillDetails(scope, {
      name: 'Recovered Customer',
      email: 'recovery@example.test',
    })
    await scope.getByRole('button', { name: 'Confirm booking' }).click()
    await expect(
      scope.getByRole('heading', { name: "You're booked" }),
    ).toBeVisible()
    expect(
      Object.values((await calendarState(page, salon.accountId)).events),
    ).toHaveLength(1)
  } finally {
    await guest.close()
  }
})

test('built package on a plain second origin enforces CORS, books, and rejects a rotated key', async ({
  page,
  browser,
  baseURL,
}) => {
  const salon = await createSalon(page, { services: [{ name: 'Trim' }] })
  await page.getByRole('link', { name: 'Developers', exact: true }).click()
  const key = await page
    .getByLabel('Publishable key', { exact: true })
    .inputValue()
  const origin = `http://localhost:${process.env.E2E_EMBED_PORT ?? 3253}`
  const guest = await browser.newContext()
  try {
    const embedded = await guest.newPage()
    const failures: string[] = []
    embedded.on('requestfailed', (request) => {
      if (request.url().includes('/api/v1/'))
        failures.push(request.failure()?.errorText ?? '')
    })
    const url = `${origin}/?${new URLSearchParams({ host: baseURL!, key })}`
    await embedded.goto(url)
    await expect(embedded.getByRole('status')).toBeVisible()
    await expect.poll(() => failures.length).toBeGreaterThan(0)
    await page.getByLabel('Site origin').fill(origin)
    await page.getByRole('button', { name: 'Add site' }).click()
    await expect(
      page.getByRole('button', { name: `Remove ${origin}` }),
    ).toBeVisible()
    await embedded.reload()
    const scope = embedded.locator('.openslots').first()
    await scope.getByRole('button', { name: /Trim/ }).click()
    await chooseTime(scope)
    const selected = scope.getByRole('button', { name: 'Continue' })
    expect(await selected.evaluate((el) => getComputedStyle(el).display)).toBe(
      'inline-flex',
    )
    expect(
      await embedded.locator('#host').evaluate((el) => ({
        size: getComputedStyle(el).fontSize,
        padding: getComputedStyle(el).padding,
      })),
    ).toEqual({ size: '23px', padding: '7px' })
    await selected.click()
    await fillDetails(scope, {
      name: 'Embedded Customer',
      email: 'embed@example.test',
    })
    await scope.getByRole('button', { name: 'Confirm booking' }).click()
    await expect(
      scope.getByRole('heading', { name: "You're booked" }),
    ).toBeVisible()
    expect(
      Object.values((await calendarState(page, salon.accountId)).events),
    ).toHaveLength(1)
    await page.getByRole('button', { name: 'Rotate key' }).click()
    await page.getByRole('button', { name: 'Confirm rotation' }).click()
    await expect(
      page.getByLabel('Publishable key', { exact: true }),
    ).not.toHaveValue(key)
    await embedded.reload()
    // The private /business response may remain cached for 60 seconds.
    // A fresh slots request must reject the old key immediately.
    // Wait for the refused slots request itself: a loading spinner also has
    // role "status" and no enabled days, so those alone would prove nothing.
    // The browser reports a refused cross-origin call either as a 401
    // response or, when it blocks the response for lacking CORS headers, as
    // a failed request. Either way it must be the slots call itself.
    const isSlots = (url: string) => new URL(url).pathname === '/api/v1/slots'
    const refused = Promise.race([
      embedded.waitForResponse(
        (response) => isSlots(response.url()) && response.status() === 401,
      ),
      embedded.waitForEvent('requestfailed', (request) =>
        isSlots(request.url()),
      ),
    ])
    await embedded.getByRole('button', { name: /Trim/ }).click()
    await refused
    await expect(
      embedded.locator('[data-date]:not([aria-disabled])'),
    ).toHaveCount(0)
    // And directly: the old key is rejected, the new one accepted.
    expect(
      (
        await page.request.get('/api/v1/business', {
          headers: { 'X-OpenSlots-Key': key },
        })
      ).status(),
    ).toBe(401)
  } finally {
    await guest.close()
  }
})

test('Tokyo customer books next-day local time while owner sees the Denver day', async ({
  page,
  browser,
  baseURL,
}) => {
  const salon = await createSalon(page, { services: [{ name: 'Trim' }] })
  const guest = await browser.newContext({ baseURL, timezoneId: 'Asia/Tokyo' })
  try {
    const customer = await guest.newPage()
    await customer.goto(`/b/${salon.slug}/trim`)
    const scope = customer.locator('.openslots').first()
    await expect(scope.getByRole('combobox')).toHaveValue('Asia/Tokyo')
    await expect(scope).toContainText('America/Denver')
    await expect(scope).toContainText('Asia/Tokyo')
    const day = await openDay(scope)
    const localDate = await day.getAttribute('data-date')
    await day.click()
    await scope.getByRole('group').getByRole('button').first().click()
    await scope.getByRole('button', { name: 'Continue' }).click()
    await fillDetails(scope, {
      name: 'Tokyo Customer',
      email: 'tokyo@example.test',
    })
    const booked = customer.waitForResponse(
      (r) =>
        r.url().endsWith('/api/v1/bookings') && r.request().method() === 'POST',
    )
    await scope.getByRole('button', { name: 'Confirm booking' }).click()
    const response = await booked
    expect(response.status()).toBe(201)
    const booking = await response.json()
    const dateIn = (zone: string) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(booking.start))
    expect(dateIn('Asia/Tokyo')).toBe(localDate)
    expect(dateIn('America/Denver')).not.toBe(localDate)
    await page.getByRole('link', { name: /^Bookings(?: \d+)?$/ }).click()
    const label = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Denver',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(booking.start))
    await expect(
      page.getByRole('heading', { name: new RegExp(label) }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Tokyo Customer/ }),
    ).toBeVisible()
    await customer.goto(booking.manageUrl)
    await expect(customer.getByRole('main')).toContainText(
      'Times shown in Japan Standard Time',
    )
    const events = Object.values(
      (await calendarState(page, salon.accountId)).events,
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.event.start.dateTime).toBe(booking.start)
  } finally {
    await guest.close()
  }
})

test('customer cancellation from a stale manage page truthfully cancels the owner-moved booking', async ({
  page,
  browser,
  baseURL,
}) => {
  const salon = await createSalon(page, { services: [{ name: 'Trim' }] })
  const guest = await browser.newContext({ baseURL })
  try {
    const customer = await guest.newPage()
    await customer.goto(`/b/${salon.slug}/trim`)
    const scope = customer.locator('.openslots').first()
    await chooseTime(scope)
    await scope.getByRole('button', { name: 'Continue' }).click()
    await fillDetails(scope, {
      name: 'Stale Customer',
      email: 'stale@example.test',
    })
    await scope.getByRole('button', { name: 'Confirm booking' }).click()
    const manage = scope.getByRole('link', { name: /Reschedule or cancel/ })
    await expect(manage).toBeVisible()
    await customer.goto((await manage.getAttribute('href'))!)
    await expect(
      customer.getByRole('button', { name: 'Cancel booking', exact: true }),
    ).toBeVisible()
    await page.getByRole('link', { name: /^Bookings(?: \d+)?$/ }).click()
    const row = page.getByRole('button', { name: /Stale Customer/ })
    await row.click()
    await page.getByRole('button', { name: 'Reschedule', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await (await openDay(dialog)).click()
    await dialog
      .getByRole('button', { name: /[AP]M, / })
      .last()
      .click()
    await dialog.getByRole('button', { name: 'Confirm reschedule' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(row).toContainText('Rescheduled')
    expect(
      (await calendarState(page, salon.accountId)).operations.some(
        (op) => op.kind === 'update',
      ),
    ).toBe(true)
    await customer
      .getByRole('button', { name: 'Cancel booking', exact: true })
      .click()
    const cancelled = customer.waitForResponse((r) =>
      /\/api\/v1\/manage\/[^/]+\/cancel$/.test(r.url()),
    )
    await customer.getByRole('button', { name: 'Yes, cancel booking' }).click()
    const response = await cancelled
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'cancelled' })
    await expect(customer.getByRole('main')).toContainText('Cancelled')
    expect(
      Object.keys((await calendarState(page, salon.accountId)).events),
    ).toHaveLength(0)
    await page.reload()
    await expect(row).toHaveCount(0)
    await page.getByRole('link', { name: 'Cancelled', exact: true }).click()
    await expect(row).toContainText('Cancelled')
  } finally {
    await guest.close()
  }
})

test('one owner switches between two businesses with isolated schedules, services, keys and bookings', async ({
  page,
  browser,
  baseURL,
}) => {
  const a = await createSalon(page, {
    name: 'Business Alpha',
    services: [{ name: 'Alpha Trim' }],
  })
  const keyOnScreen = async () => {
    await page.getByRole('link', { name: 'Developers', exact: true }).click()
    return page.getByLabel('Publishable key', { exact: true }).inputValue()
  }
  const keyA = await keyOnScreen()
  await page.getByRole('button', { name: /Switch business/ }).click()
  await page.getByRole('menuitem', { name: 'Add a business' }).click()
  const slugB = `beta-${Date.now()}`
  await page.getByLabel('Business name').fill('Business Beta')
  await page.getByLabel('Booking page address').fill(slugB)
  await page.getByRole('button', { name: 'Add business' }).click()
  await expect(page).toHaveURL(/\/availability$/)
  await page.getByLabel('Monday start', { exact: true }).fill('11 AM')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Availability saved.').first()).toBeVisible()
  await page.getByRole('link', { name: /^Calendars/ }).click()
  await expect(
    page.getByText('No booking calendar', { exact: false }).first(),
  ).toBeVisible()
  await page.getByRole('button', { name: /Connect signed-in/ }).click()
  await expect(page.getByText('New bookings go here')).toBeVisible()
  await page.getByRole('switch').first().click()
  await expect(page.getByRole('switch').first()).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Saved')
  await page.getByRole('link', { name: /^Services(?: \d+)?$/ }).click()
  await expect(page.getByText('Alpha Trim', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'New service', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Beta Trim')
  await page.getByRole('button', { name: 'Create service' }).click()
  await expect(page).toHaveURL(/\/services$/)
  const keyB = await keyOnScreen()
  expect(keyB).not.toBe(keyA)
  const guest = await browser.newContext({ baseURL })
  const bookings: { name: string; token: string; start: string }[] = []
  try {
    const customer = await guest.newPage()
    for (const [slug, name] of [
      [a.slug, 'Alpha Customer'],
      [slugB, 'Beta Customer'],
    ]) {
      await customer.goto(`/b/${slug}`)
      const scope = customer.locator('.openslots').first()
      await scope.getByRole('button', { name: /Trim/ }).click()
      await chooseTime(scope)
      await scope.getByRole('button', { name: 'Continue' }).click()
      await fillDetails(scope, {
        name: name!,
        email: `${name!.split(' ')[0]!.toLowerCase()}@example.test`,
      })
      const result = customer.waitForResponse(
        (r) =>
          r.url().endsWith('/api/v1/bookings') &&
          r.request().method() === 'POST',
      )
      await scope.getByRole('button', { name: 'Confirm booking' }).click()
      const booking = await (await result).json()
      bookings.push({
        name: name!,
        token: booking.manageUrl.split('/').pop(),
        start: booking.start,
      })
    }
    for (const [name, other, key, hour] of [
      ['Business Alpha', 'Beta', keyA, '9:00 AM'],
      ['Business Beta', 'Alpha', keyB, '11:00 AM'],
    ]) {
      await page.getByRole('button', { name: /Switch business/ }).click()
      await page.getByRole('menuitem', { name: name!, exact: true }).click()
      await expect(
        page.getByRole('button', {
          name: new RegExp(`${name!.split(' ')[1]} Customer`),
        }),
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: new RegExp(`${other} Customer`) }),
      ).toHaveCount(0)
      await page.getByRole('link', { name: /^Services(?: \d+)?$/ }).click()
      await expect(
        page.getByText(`${other} Trim`, { exact: true }),
      ).toHaveCount(0)
      await page.getByRole('link', { name: /^Availability/ }).click()
      await expect(
        page.getByLabel('Monday start', { exact: true }),
      ).toHaveValue(hour!)
      await page.getByRole('link', { name: /^Calendars/ }).click()
      await expect(page.getByText('New bookings go here')).toBeVisible()
      await expect(page.getByRole('switch').first()).toHaveAttribute(
        'aria-checked',
        name === 'Business Alpha' ? 'true' : 'false',
      )
      expect(await keyOnScreen()).toBe(key)
      await page.getByRole('link', { name: 'Settings', exact: true }).click()
      await expect(page.getByLabel('Business name')).toHaveValue(name!)
    }
    const beta = await (
      await page.request.get('/api/v1/business', {
        headers: { 'X-OpenSlots-Key': keyB },
      })
    ).json()
    const headers = { 'X-OpenSlots-Key': keyA }
    const from = new Date().toISOString().slice(0, 10)
    const to = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    expect(
      (
        await page.request.get(
          `/api/v1/slots?service=${beta.services[0].id}&from=${from}&to=${to}&tz=UTC`,
          { headers },
        )
      ).status(),
    ).toBe(404)
    expect(
      (
        await page.request.get(`/api/v1/manage/${bookings[1]!.token}`, {
          headers,
        })
      ).status(),
    ).toBe(404)
    const own = await (
      await page.request.get('/api/v1/business', { headers })
    ).json()
    expect(own.services.map((s: { name: string }) => s.name)).toEqual([
      'Alpha Trim',
    ])
  } finally {
    await guest.close()
  }
})
