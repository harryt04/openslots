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

test('sidebar avatar and active navigation count meet text contrast in both modes', async ({
  page,
}) => {
  const { createSalon } = await import('./support/salon')
  const { resolve } = await import('node:path')
  const { measureContrast } = await new Function('path', 'return import(path)')(
    resolve('scripts/contrast.mjs'),
  )
  await createSalon(page, { name: 'Visual Salon', services: [] })
  await page.goto('/services')
  for (const mode of ['light', 'dark']) {
    await page.evaluate((mode) => {
      document.documentElement.classList.toggle('dark', mode === 'dark')
      document.documentElement.classList.toggle('light', mode === 'light')
      // Decorative initials still need legible ink; expose only for sampling.
      document
        .querySelector('[aria-label*="Switch business"] [aria-hidden]')
        ?.removeAttribute('aria-hidden')
    }, mode)
    const rows = (await measureContrast(page)) as {
      text: string
      ratio: number
      threshold: number
    }[]
    const samples = rows.filter((row) => row.text === 'VS' || row.text === '0')
    expect(samples.length).toBeGreaterThanOrEqual(2)
    for (const row of samples)
      expect(row.ratio, `${mode}: ${row.text}`).toBeGreaterThanOrEqual(
        row.threshold,
      )
  }
})
