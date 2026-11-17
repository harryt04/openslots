import { expect, test } from '@playwright/test'
import { createSalon } from './support/salon'

test('page families set browser security headers, including unknown manage links', async ({
  page,
}) => {
  const { slug } = await createSalon(page, { services: [{ name: 'Trim' }] })
  for (const path of [
    '/',
    '/login',
    `/b/${slug}`,
    '/m/' + 'x'.repeat(43),
    '/dev/tokens',
  ]) {
    const response = await page.goto(path)
    const headers = response!.headers()
    expect(headers['x-content-type-options'], path).toBe('nosniff')
    const csp = headers['content-security-policy']!
    expect(csp, path).toContain("object-src 'none'")
    expect(csp, path).toContain("base-uri 'self'")
    expect(csp, path).toContain(
      `frame-ancestors ${path.startsWith('/b/') ? '*' : path.startsWith('/m/') ? "'self'" : "'none'"}`,
    )
    if (path.startsWith('/m/')) {
      expect(headers['referrer-policy']).toBe('no-referrer')
      expect(headers['cache-control']).toContain('no-store')
    }
  }
})

test('calendar notices cannot display URL supplied prose', async ({ page }) => {
  await createSalon(page, { services: [] })
  await page.goto('/calendars?notice=Your%20account%20was%20hacked')
  await expect(page.getByRole('status')).not.toContainText('hacked')
  await expect(page.getByText('Checked just now')).toBeVisible()
})
