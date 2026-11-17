import { expect, test } from '@playwright/test'

for (const mode of ['light', 'dark']) {
  test(`sign-in panel uses the mode's primary foreground (${mode})`, async ({
    page,
  }) => {
    await page.goto('/login')
    await page.evaluate((mode) => localStorage.setItem('theme', mode), mode)
    await page.reload()
    const panel = page.locator('main section').first()
    await expect(panel).toHaveCSS(
      'color',
      mode === 'dark' ? 'rgb(12, 10, 26)' : 'rgb(255, 255, 255)',
    )
    await page.keyboard.press('Tab')
    const focus = page.locator(':focus-visible')
    await expect(focus).toHaveCSS('outline-width', '2px')
    await expect(focus).toHaveCSS('outline-style', 'solid')
  })
}
