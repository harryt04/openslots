import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Sets up an owner the way a person would, through the real screens: sign in,
 * create a business, connect the fake Google account as the booking calendar
 * and add services. The default weekly hours (Monday to Friday, 9 to 5) stay.
 */
export async function createSalon(
  page: Page,
  options: {
    name?: string
    slug?: string
    services: { name: string; minutes?: number; phone?: boolean }[]
  },
): Promise<{ slug: string; accountId: string; accountEmail: string }> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const slug = options.slug ?? `salon-${stamp}`
  const ownerEmail = `owner-${stamp}@example.test`
  await page.goto('/dev/sign-in')
  await page.getByLabel('Email').fill(ownerEmail)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Business name').fill(options.name ?? 'Shear Bliss')
  await page.getByLabel('Booking page address').fill(slug)
  await page.getByRole('button', { name: 'Create business' }).click()
  await expect(page).toHaveURL(/\/availability$/)

  await page.goto('/calendars')
  // Connecting is a server action whose body names the account.
  const linking = page.waitForRequest(
    (r) =>
      r.method() === 'POST' &&
      new URL(r.url()).pathname === '/calendars' &&
      /"accountId":"[0-9a-f]{24}"/.test(r.postData() ?? ''),
  )
  await page.getByRole('button', { name: /Connect signed-in/ }).click()
  const accountId = /"accountId":"([0-9a-f]{24})"/.exec(
    (await linking).postData() ?? '',
  )![1]!
  await expect(page.getByText('New bookings go here')).toBeVisible()
  // The fake Google account's email, as the Calendars page names it.
  // The signed-in fake account has no email of its own; the fake-only
  // /dev/calendar route finds it by the same empty value.
  const shown = await page.locator('section h2').first().innerText()
  const accountEmail = shown.includes('@') ? shown : ''

  for (const service of options.services) {
    await page.goto('/services/new')
    await page.getByLabel('Name', { exact: true }).fill(service.name)
    if (service.minutes) {
      await page
        .getByRole('radio', { name: String(service.minutes), exact: true })
        .click()
    }
    if (service.phone) {
      await page.getByRole('switch', { name: /phone/i }).click()
    }
    await page.getByRole('button', { name: 'Create service' }).click()
    await expect(page).toHaveURL(/\/services$/)
  }
  return { slug, accountId, accountEmail }
}

/** The fake calendar's state for an account, read through the owner's session. */
export async function calendarState(page: Page, accountId: string) {
  const response = await page.request.get(
    `/dev/calendar?accountId=${accountId}`,
  )
  expect(response.ok()).toBe(true)
  return (await response.json()) as {
    events: Record<
      string,
      {
        calendarId: string
        event: {
          summary: string
          description?: string
          start: { dateTime: string }
          attendees: { email: string }[]
        }
      }
    >
    operations: { kind: 'create' | 'update' | 'delete' }[]
  }
}

/** The day grid sets `data-state="ready"` when this month's slots arrived. */
export async function readyGrid(scope: Locator): Promise<Locator> {
  const grid = scope.locator('[role=grid]')
  await expect(grid).toHaveAttribute('data-state', 'ready')
  return grid
}

/**
 * The `nth` open day, stepping forward a month at a time. Tests use the third
 * one, so that a time already passed today never thins out the day's times.
 */
export async function openDay(scope: Locator, nth = 2): Promise<Locator> {
  for (let i = 0; i < 3; i++) {
    const grid = await readyGrid(scope)
    const open = grid.locator('button[data-date]:not([aria-disabled])')
    if ((await open.count()) > nth) return open.nth(nth)
    const month = (await grid.getAttribute('data-month')) ?? ''
    await scope.getByRole('button', { name: 'Next month' }).click()
    await expect(grid).not.toHaveAttribute('data-month', month)
  }
  throw new Error('fewer than three open days in three months')
}

/** Chooses the third open day and its `index`th time; returns the time's label. */
export async function chooseTime(scope: Locator, index = 0): Promise<string> {
  await (await openDay(scope)).click()
  const time = scope.getByRole('group').getByRole('button').nth(index)
  const label = (await time.innerText()).trim()
  await time.click()
  return label
}

export async function fillDetails(
  scope: Locator,
  who: { name: string; email: string; phone?: string },
) {
  await scope.getByLabel('Name').fill(who.name)
  await scope.getByLabel('Email').fill(who.email)
  if (who.phone) await scope.getByLabel('Phone').fill(who.phone)
}

/** A page of a customer who is not signed in: a fresh browser context. */
export async function newCustomer(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}
