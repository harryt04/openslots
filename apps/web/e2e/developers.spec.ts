import { expect, test } from '@playwright/test'

test('developers settings and a public API booking journey', async ({
  page,
  context,
}) => {
  test.slow()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/dev/sign-in')
  await page.getByLabel('Email').fill(`api-${Date.now()}@example.test`)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Business name').fill('API Salon')
  await page.getByLabel('Booking page address').fill(`api-${Date.now()}`)
  await page.getByRole('button', { name: 'Create business' }).click()
  await expect(page).toHaveURL(/availability/)
  await page.goto('/developers')
  const keyInput = page.getByLabel('Publishable key', { exact: true })
  const oldKey = await keyInput.inputValue()
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Key copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(oldKey)
  await page.getByRole('button', { name: 'Rotate key' }).focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  expect(
    await page
      .getByRole('button', { name: 'Rotate key' })
      .evaluate((el) => getComputedStyle(el).outlineWidth),
  ).toBe('2px')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alertdialog')).toContainText(
    'old key stops working at once',
  )
  await page.getByRole('button', { name: 'Confirm rotation' }).click()
  await expect(keyInput).not.toHaveValue(oldKey)
  const key = await keyInput.inputValue()
  await expect(page.locator('pre').last()).toContainText(key)
  await expect(page.locator('pre').last()).toContainText(
    new URL(page.url()).origin,
  )
  await page.getByLabel('Site origin').fill('http://example.com/path')
  await page.getByRole('button', { name: 'Add site' }).click()
  await expect(page.getByRole('status')).toContainText('Enter an origin')
  await page.getByLabel('Site origin').fill('https://embed.example.test')
  await page.getByRole('button', { name: 'Add site' }).click()
  await page
    .getByRole('button', { name: 'Remove https://embed.example.test' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Remove https://embed.example.test' }),
  ).toHaveCount(0)
  await page.goto('/calendars')
  await page.getByRole('button', { name: /Connect signed-in/ }).click()
  await expect(page.getByText('New bookings go here')).toBeVisible()
  await page.goto('/services/new')
  await page.getByLabel('Name', { exact: true }).fill('Cut')
  await page.getByRole('button', { name: 'Create service' }).click()
  await expect(page).toHaveURL(/\/services$/)
  const headers = { 'X-OpenSlots-Key': key }
  expect(
    (
      await page.request.get('/api/v1/business', {
        headers: { 'X-OpenSlots-Key': oldKey },
      })
    ).status(),
  ).toBe(401)
  const business = await (
    await page.request.get('/api/v1/business', { headers })
  ).json()
  expect(business.services).toHaveLength(1)
  const from = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const to = new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10)
  const slots = await (
    await page.request.get(
      `/api/v1/slots?service=${business.services[0].id}&from=${from}&to=${to}&tz=UTC`,
      { headers },
    )
  ).json()
  const times = Object.values(slots.days).flat() as string[]
  expect(times.length).toBeGreaterThan(2)
  const create = await page.request.post('/api/v1/bookings', {
    headers,
    data: {
      serviceId: business.services[0].id,
      start: times[0],
      timezone: 'UTC',
      customer: { name: 'Test Customer', email: 'customer@example.test' },
    },
  })
  expect(create.status()).toBe(201)
  const booked = await create.json(),
    token = booked.manageUrl.split('/').pop()
  expect(
    (await page.request.get(`/api/v1/manage/${token}`, { headers })).status(),
  ).toBe(200)
  const moved = await page.request.post(`/api/v1/manage/${token}/reschedule`, {
    headers,
    data: { start: times.at(-1) },
  })
  expect(moved.status()).toBe(200)
  const cancelled = await page.request.post(`/api/v1/manage/${token}/cancel`, {
    headers,
    data: {},
  })
  expect(cancelled.status()).toBe(200)
  expect((await cancelled.json()).status).toBe('cancelled')
})

test('fake owner flows report no CSP violations', async ({ page }) => {
  const manage = await page.request.get('/m/test')
  expect(manage.headers()['content-security-policy']).toContain(
    "frame-ancestors 'self'",
  )
  const booking = await page.request.get('/b/test')
  expect(booking.headers()['content-security-policy']).toContain(
    'frame-ancestors *',
  )
  await page.addInitScript(() => {
    const violations: string[] = []
    Object.assign(window, { cspViolations: violations })
    document.addEventListener('securitypolicyviolation', (e) => {
      violations.push(e.violatedDirective)
      sessionStorage.setItem('cspViolations', JSON.stringify(violations))
    })
  })
  await page.goto('/dev/sign-in')
  await page.getByLabel('Email').fill(`csp-${Date.now()}@example.test`)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Business name').fill('CSP Salon')
  await page.getByLabel('Booking page address').fill(`csp-${Date.now()}`)
  await page.getByRole('button', { name: 'Create business' }).click()
  await expect(page).toHaveURL(/availability/)
  for (const route of [
    '/calendars',
    '/services',
    '/availability',
    '/developers',
    '/dev/gallery',
  ]) {
    await page.goto(route)
    await expect(page.locator('body')).toBeVisible()
    if (route === '/calendars') {
      await page.getByRole('button', { name: /Connect signed-in/ }).click()
      await expect(page.getByText('New bookings go here')).toBeVisible()
    }
    expect(
      await page.evaluate(() => sessionStorage.getItem('cspViolations')),
    ).toBeNull()
  }
})
