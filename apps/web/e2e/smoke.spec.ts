import { expect, test } from '@playwright/test'

test('the token sheet renders with Voltage colors in light and dark', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/dev/tokens')
  await expect(
    page.getByRole('heading', { name: 'Look and color' }),
  ).toBeVisible()

  const background = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(await background()).toBe('rgb(251, 250, 255)')

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(background).toBe('rgb(12, 10, 26)')
})

test('status badges never rely on color alone', async ({ page }) => {
  await page.goto('/dev/tokens')
  for (const badge of await page.locator('main [data-status]').all()) {
    const hasIcon = (await badge.locator('svg').count()) > 0
    const struck = await badge.evaluate((el) =>
      getComputedStyle(el).textDecorationLine.includes('line-through'),
    )
    const status = await badge.getAttribute('data-status')
    // "short-day" is the neutral default look, so its label alone carries it.
    expect(hasIcon || struck || status === 'short-day', status ?? '').toBe(true)
    await expect(badge).not.toBeEmpty()
  }
})

test('focus is shown with a 2px ring', async ({ page }) => {
  await page.goto('/dev/tokens')
  await expect(
    page.getByRole('heading', { name: 'Look and color' }),
  ).toBeVisible()
  await page.keyboard.press('Tab')
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement!)
    return `${style.outlineWidth} ${style.outlineStyle}`
  })
  expect(outline).toBe('2px solid')
})

test('sign-in, onboarding, creating and switching businesses', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)

  // A unique user, so parallel runs and reruns start with no business.
  await page.goto('/dev/sign-in')
  await page.getByLabel('Email').fill(`owner-${Date.now()}@example.test`)
  await page.getByRole('button', { name: 'Sign in' }).click()

  // S1-3: first sign-in lands on "name your business".
  await expect(page).toHaveURL(/\/onboarding$/)
  await expect(
    page.getByRole('heading', { name: 'Name your business' }),
  ).toBeVisible()
  await page.getByLabel('Business name').fill('Shear Bliss Salon')
  await expect(page.getByLabel('Booking page address')).toHaveValue(
    'shear-bliss-salon',
  )
  const slug = `shear-${Date.now()}`
  await page.getByLabel('Booking page address').fill(slug)
  await page.getByRole('button', { name: 'Create business' }).click()

  await expect(page).toHaveURL(/\/availability$/)
  const nav = page.getByRole('link', { name: 'Availability' })
  await expect(nav).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('1 business', { exact: true })).toBeVisible()

  // Reserved words are refused inline.
  await page.goto('/settings')
  await page.getByLabel('Booking page address').fill('api')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('That address is reserved')).toBeVisible()

  // A second business, from the switcher.
  await page.getByRole('button', { name: /Switch business/ }).click()
  await page.getByRole('menuitem', { name: 'Add a business' }).click()
  await expect(page).toHaveURL(/\/onboarding$/)
  await page.getByLabel('Business name').fill('Second Shop')
  await page.getByLabel('Booking page address').fill(`second-${Date.now()}`)
  await page.getByRole('button', { name: 'Add business' }).click()
  await expect(page).toHaveURL(/\/availability$/)
  await expect(page.getByText('2 businesses', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Business: Second Shop/ }),
  ).toBeVisible()

  // Switch back to the first.
  await page.getByRole('button', { name: /Switch business/ }).click()
  await page.getByRole('menuitem', { name: 'Shear Bliss Salon' }).click()
  await expect(
    page.getByRole('button', { name: /Business: Shear Bliss Salon/ }),
  ).toBeVisible()
  await expect(
    page.getByText('Everything customers have booked with Shear Bliss Salon.'),
  ).toBeVisible()
})

test('login errors and fake calendar seeding', async ({ page, request }) => {
  await page.goto('/login?error=EMAIL_NOT_ALLOWED')
  await expect(page.locator('p[role=alert]')).toContainText('not allowed')
  await page.goto('/login?error=access_denied')
  await expect(page.locator('p[role=alert]')).toHaveText(
    'Unable to sign in. Please try again.',
  )
  expect(
    (
      await request.put('/dev/calendar?accountId=someone-else', {
        data: {},
        maxRedirects: 0,
      })
    ).status(),
  ).not.toBe(200)
  for (const endpoint of [
    'get-access-token',
    'refresh-token',
    'account-info',
  ]) {
    expect(
      (await request.post('/api/auth/' + endpoint, { data: {} })).status(),
    ).toBe(404)
  }
})
