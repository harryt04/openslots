import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
test('calendar linking, choices, auth failure and reconnect', async ({
  page,
}) => {
  const directory = resolve(process.cwd(), '../../.screenshots')
  await mkdir(directory, { recursive: true })
  const capture = async (name: string) => {
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        localStorage.setItem('theme', theme)
      }, theme)
      await page.reload()
      await expect(
        page.getByRole('heading', { name: /Calendars|Bookings/, exact: true }),
      ).toBeVisible()
      await page.screenshot({
        path: resolve(directory, `${name}-${theme}.png`),
        fullPage: true,
      })
    }
  }
  test.setTimeout(90_000)
  await page.goto('/dev/sign-in')
  await page.getByLabel('Email').fill(`cal-${Date.now()}@example.test`)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Business name').fill('Calendar shop')
  await page.getByLabel('Booking page address').fill(`cal-${Date.now()}`)
  await page.getByRole('button', { name: 'Create business' }).click()
  await page.goto('/calendars')
  await capture('empty')
  await page.getByRole('button', { name: /Connect signed-in/ }).click()
  await expect(page.getByText('New bookings go here')).toBeVisible()
  await page.getByRole('switch').first().focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('switch').first()).toBeFocused()
  expect(
    await page
      .getByRole('switch')
      .first()
      .evaluate((el) => getComputedStyle(el).outlineWidth),
  ).toBe('2px')
  await page.keyboard.press('Space')
  await expect(page.getByRole('switch').first()).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page
    .getByRole('button', { name: 'Link another Google account' })
    .click()
  await expect(page.getByText('Connected', { exact: true })).toHaveCount(2)
  await capture('connected')
  await page
    .getByRole('button', { name: 'Receive bookings here' })
    .first()
    .click()
  await expect(page.getByText('New bookings go here')).toHaveCount(1)
  const second = page
    .locator('section')
    .filter({ has: page.locator('h2') })
    .last()
  const email = await second.locator('h2').innerText()
  // Fake-only route resolves the account by the owned email; no tokens in browser.
  await page.request.post('/dev/calendar', {
    data: { email, authFailure: true },
  })
  await second.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('Needs reconnect', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Needs attention')).toBeVisible()
  await capture('reconnect')
  await page.setViewportSize({ width: 390, height: 844 })
  await capture('mobile')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(
    page.getByText('Calendar connection needs reconnecting.', { exact: false }),
  ).toBeVisible()
  await capture('banner')
  await page.goto('/calendars')
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click()
  await expect(page.getByText('Connected', { exact: true })).toHaveCount(2)
})
