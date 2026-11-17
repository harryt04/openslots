import { expect, test } from '@playwright/test'
import { createSalon, readyGrid } from './support/salon'

test('owner setup follows visible navigation to a working booking link', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const salon = await createSalon(page, {
    name: 'Shear Bliss Salon',
    services: [{ name: 'Trim', minutes: 30 }],
  })
  await page.getByRole('link', { name: /^Bookings(?: \d+)?$/ }).click()
  await page
    .getByRole('button', { name: 'Copy booking link', exact: true })
    .click()
  const url = await page.evaluate(() => navigator.clipboard.readText())
  expect(new URL(url).pathname).toBe(`/b/${salon.slug}`)
  await page.goto(url)
  await page.getByRole('button', { name: /Trim/ }).click()
  await readyGrid(page.locator('.openslots'))
})
