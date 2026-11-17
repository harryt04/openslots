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
  for (const badge of await page.locator('[data-status]').all()) {
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
  await page.keyboard.press('Tab')
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement!)
    return `${style.outlineWidth} ${style.outlineStyle}`
  })
  expect(outline).toBe('2px solid')
})

test('a signed-out visitor is sent to sign in, and the test sign-in works', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)

  await page.getByRole('link', { name: 'Use the test sign-in' }).click()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Welcome, Jordan Lee')).toBeVisible()
})
