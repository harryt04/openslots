import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
test('owner sees API bookings, searches, opens by keyboard, reschedules and cancels', async ({
  page,
}) => {
  test.slow()
  const capture = async (state: string) => {
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        localStorage.setItem('theme', theme)
        document.documentElement.classList.toggle('dark', theme === 'dark')
        document.documentElement.classList.toggle('light', theme === 'light')
      }, theme)
      await page.screenshot({
        path: resolve('../../.screenshots', `bookings-${state}-${theme}.png`),
        fullPage: true,
        animations: 'disabled',
      })
    }
    await page.evaluate(() => {
      localStorage.setItem('theme', 'light')
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
    })
  }
  await page.goto('/dev/sign-in')
  await page.getByLabel('Email').fill(`bookings-${Date.now()}@example.test`)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Business name').fill('Dashboard Salon')
  await page.getByLabel('Booking page address').fill(`dashboard-${Date.now()}`)
  await page.getByRole('button', { name: 'Create business' }).click()
  await expect(page).toHaveURL(/availability/)
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'No bookings to show' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Add your first service' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Connect a booking calendar' }),
  ).toBeVisible()
  await capture('empty')
  await page.goto('/calendars')
  await page.getByRole('button', { name: /Connect signed-in/ }).click()
  await expect(page.getByText('New bookings go here')).toBeVisible()
  await page.goto('/services/new')
  await page.getByLabel('Name', { exact: true }).fill('Cut')
  await page.getByRole('button', { name: 'Create service' }).click()
  await expect(page).toHaveURL(/\/services$/)
  await page.goto('/developers')
  const key = await page
    .getByLabel('Publishable key', { exact: true })
    .inputValue()
  const accounts = await (
    await page.request.get('/api/auth/list-accounts')
  ).json()
  const account = accounts.find(
    (a: { providerId: string }) => a.providerId === 'google',
  )
  const calendarState = async () =>
    (await page.request.get(`/dev/calendar?accountId=${account.id}`)).json()
  const headers = { 'X-OpenSlots-Key': key }
  const business = await (
    await page.request.get('/api/v1/business', { headers })
  ).json()
  const from = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    to = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
  const slots = await (
    await page.request.get(
      `/api/v1/slots?service=${business.services[0].id}&from=${from}&to=${to}&tz=UTC`,
      { headers },
    )
  ).json()
  const times = Object.values(slots.days).flat() as string[]
  const create = await page.request.post('/api/v1/bookings', {
    headers,
    data: {
      serviceId: business.services[0].id,
      start: times[0],
      timezone: 'UTC',
      customer: { name: 'Dashboard Customer', email: 'dash@example.test' },
    },
  })
  expect(create.status()).toBe(201)
  expect(Object.keys((await calendarState()).events)).toHaveLength(1)
  const secondStart = times.at(-1)!
  expect(
    (
      await page.request.post('/api/v1/bookings', {
        headers,
        data: {
          serviceId: business.services[0].id,
          start: secondStart,
          timezone: 'UTC',
          customer: { name: 'Another Customer', email: 'another@example.test' },
        },
      })
    ).status(),
  ).toBe(201)
  await page.goto('/')
  for (const start of [times[0]!, secondStart]) {
    const label = new Intl.DateTimeFormat('en-US', {
      timeZone: business.timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(start))
    await expect(
      page.getByRole('heading', { name: new RegExp(label) }),
    ).toBeVisible()
  }
  const row = page.getByRole('button', { name: /Dashboard Customer/ })
  await expect(row).toBeVisible()
  await capture('list')
  await page.setViewportSize({ width: 390, height: 844 })
  await capture('mobile')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page
    .getByRole('textbox', { name: 'Search customers' })
    .fill('no match [.*]')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(row).toHaveCount(0)
  await page.goto('/')
  await row.focus()
  expect(await row.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe(
    '2px',
  )
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toContainText('dash@example.test')
  await capture('details')
  await page.getByRole('button', { name: 'Reschedule', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog').getByRole('grid')).toBeVisible()
  const dialog = page.getByRole('dialog')
  const openDays = dialog.getByRole('button', {
    name: /, [1-9][0-9]* times available/,
  })
  await expect(openDays.first()).toBeVisible()
  await capture('reschedule')
  await openDays.last().focus()
  await page.keyboard.press('Enter')
  await dialog
    .getByRole('button', { name: /[AP]M, / })
    .last()
    .focus()
  await page.keyboard.press('Enter')
  await dialog.getByRole('button', { name: 'Confirm reschedule' }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
  await expect(row).toContainText('Rescheduled')
  expect(
    (await calendarState()).operations.some(
      (op: { kind: string }) => op.kind === 'update',
    ),
  ).toBe(true)
  await row.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Cancel booking' }).focus()
  await page.keyboard.press('Enter')
  await capture('cancel')
  await page.getByRole('button', { name: 'Confirm cancellation' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row).toHaveCount(0)
  await page.getByRole('link', { name: 'Cancelled', exact: true }).click()
  await expect(row).toContainText('Cancelled')
  expect(Object.keys((await calendarState()).events)).toHaveLength(1)
  expect(
    (await calendarState()).operations.some(
      (op: { kind: string }) => op.kind === 'delete',
    ),
  ).toBe(true)
})
