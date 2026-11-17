import { expect as baseExpect, test, type Page } from '@playwright/test'

// These tests open routes the dev server may not have compiled yet, which
// can take longer than the default 5 seconds on a cold CI runner.
const expect = baseExpect.configure({ timeout: 20_000 })
test.slow()

async function signInWithBusiness(page: Page, name: string) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  await page.goto('/dev/sign-in')
  await page.getByLabel('Email').fill(`services-${stamp}@example.test`)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/onboarding$/)
  await page.getByLabel('Business name').fill(name)
  await page.getByLabel('Booking page address').fill(`svc-${stamp}`)
  await page.getByRole('button', { name: 'Create business' }).click()
  await expect(page).toHaveURL(/\/availability$/)
  return `svc-${stamp}`
}

async function pick(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('create, list, pause and edit a service with a live preview', async ({
  page,
}) => {
  const businessSlug = await signInWithBusiness(page, 'Preview Salon')
  const servicesNav = page.getByRole('link', { name: /^Services/ })

  // Empty state, and the sidebar count.
  await page.goto('/services')
  await expect(
    page.getByRole('heading', { name: 'No services yet' }),
  ).toBeVisible()
  await expect(servicesNav).toContainText('0')

  // Create Full color: 180 min, 15 after, hourly, max 2 per day.
  await page.getByRole('link', { name: 'New service' }).click()
  await expect(page).toHaveURL(/\/services\/new$/)

  // An inline error from the zod schema (S4-4).
  await page.getByRole('button', { name: 'Create service' }).click()
  await expect(page.getByText('Enter a name.')).toBeVisible()

  await page.getByLabel('Name', { exact: true }).fill('Full color')
  await page.getByRole('radio', { name: 'Pink' }).click()
  await page.getByRole('radio', { name: '180' }).click()
  await pick(page, 'Buffer after', '15 min')
  await pick(page, 'Start times every', '60 min')
  await pick(page, 'Max per day', '2')

  // The preview comes from the slot engine (S4-3): the default schedule is
  // Mon to Fri 9 to 5, the example busy hour is 1 to 2 PM, so a 180 min
  // service with 15 min after starts at 9:00 AM and 2:00 PM only.
  const preview = page.getByTestId('service-preview')
  await expect(preview).toContainText('2 start times offered')
  await expect(
    preview.getByRole('radio', { name: 'Show 9:00 AM' }),
  ).toBeVisible()
  await expect(
    preview.getByRole('radio', { name: 'Show 2:00 PM' }),
  ).toBeVisible()

  // Switching the example off offers every hourly start that fits.
  await preview.getByRole('switch').click()
  await expect(preview).toContainText('6 start times offered')

  await page.getByRole('button', { name: 'Create service' }).click()
  await expect(page).toHaveURL(/\/services$/)

  const card = page
    .getByTestId('service-card')
    .filter({ hasText: 'Full color' })
  await expect(card).toContainText('180')
  await expect(card).toContainText(
    '15 min buffer after · starts every 60 min · max 2 per day · 2 hr notice',
  )
  await expect(card).toContainText(`/b/${businessSlug}/full-color`)
  await expect(servicesNav).toContainText('1')

  // Pause without deleting: shown by a label, not by color.
  // The badge appears at once, before the server has saved the change, so
  // wait for the save itself before reloading to check that it stuck.
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/services',
  )
  await card.getByRole('switch', { name: 'Bookable: Full color' }).click()
  await expect(card.locator('[data-status="paused"]')).toHaveText('Paused')
  await saved
  await page.reload()
  await expect(card.locator('[data-status="paused"]')).toBeVisible()
  await expect(
    card.getByRole('switch', { name: 'Bookable: Full color' }),
  ).not.toBeChecked()

  // Edit: a shorter service fits more starts, and the preview follows.
  await card.getByRole('link', { name: 'Edit Full color' }).click()
  await expect(page.getByRole('heading', { name: 'Full color' })).toBeVisible()
  await expect(preview).toContainText('2 start times offered')
  await page.getByRole('radio', { name: '60' }).click()
  // 60 min + 15 after, hourly, 9 to 5, busy 1 to 2: 9, 10, 11, 2, 3, 4.
  await expect(preview).toContainText('6 start times offered')

  // Custom duration must be a multiple of 5.
  await page.getByRole('radio', { name: 'Custom' }).click()
  await page.getByLabel('Custom duration in minutes').fill('62')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Must be a multiple of 5 minutes')).toBeVisible()
  // T-5: the error is marked by more than color: a warning icon before the
  // message and a thicker border on the field.
  const errorMark = await page
    .getByText('Must be a multiple of 5 minutes')
    .evaluate((el) => {
      const before = getComputedStyle(el, '::before')
      return { width: before.width, mask: before.maskImage }
    })
  expect(errorMark.width).toBe('16px')
  expect(errorMark.mask).toContain('svg')
  expect(
    await page
      .getByLabel('Custom duration in minutes')
      .evaluate((el) => getComputedStyle(el).borderTopWidth),
  ).toBe('2px')
  await expect(preview).toContainText('Fix the fields marked with an error')
  await page.getByLabel('Custom duration in minutes').fill('75')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page).toHaveURL(/\/services$/)
  await expect(card).toContainText('75')
  // Pausing survived the edit.
  await expect(card.locator('[data-status="paused"]')).toBeVisible()

  // Delete asks first.
  await card.getByRole('link', { name: 'Edit Full color' }).click()
  await page.getByRole('button', { name: 'Delete service' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(page).toHaveURL(/\/services$/)
  await expect(
    page.getByRole('heading', { name: 'No services yet' }),
  ).toBeVisible()
})

test('another business has a separate list and cannot open the service', async ({
  page,
}) => {
  await signInWithBusiness(page, 'First Shop')
  await page.goto('/services/new')
  await page.getByLabel('Name', { exact: true }).fill('Trim')
  await page.getByRole('button', { name: 'Create service' }).click()
  await expect(page).toHaveURL(/\/services$/)
  await page.getByRole('link', { name: 'Edit Trim' }).click()
  await expect(page).toHaveURL(/\/services\/[0-9a-f]{24}$/)
  const editUrl = page.url()

  // A second business of the same owner (S3-2).
  await page.getByRole('button', { name: /Switch business/ }).click()
  await page.getByRole('menuitem', { name: 'Add a business' }).click()
  await page.getByLabel('Business name').fill('Second Shop')
  await page.getByLabel('Booking page address').fill(`second-${Date.now()}`)
  await page.getByRole('button', { name: 'Add business' }).click()
  await expect(page).toHaveURL(/\/availability$/)

  await page.goto('/services')
  await expect(
    page.getByRole('heading', { name: 'No services yet' }),
  ).toBeVisible()
  const response = await page.goto(editUrl)
  expect(response?.status()).toBe(404)
})
