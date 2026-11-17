import { expect } from '@playwright/test'
import { test } from './support/privacy'
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

test('fake calendar inspection and reset cannot cross owner sessions; session cookie is HttpOnly and SameSite', async ({
  page,
  browser,
  baseURL,
  context,
}) => {
  const owner = await createSalon(page, { services: [] })
  const otherContext = await browser.newContext({ baseURL })
  try {
    const otherPage = await otherContext.newPage()
    await createSalon(otherPage, { services: [] })
    const before = await page.request.get(
      `/dev/calendar?accountId=${owner.accountId}`,
    )
    const state = await before.json()
    for (const method of ['GET', 'PUT']) {
      const response = await otherPage.request.fetch(
        `/dev/calendar?accountId=${owner.accountId}`,
        {
          method,
          ...(method === 'PUT' ? { data: { authFailure: true } } : {}),
        },
      )
      expect(response.status(), method).toBe(403)
    }
    // POST identifies accounts by owned email, not by id. Foreign ids are
    // ignored by its schema and must not be able to select the target account.
    const response = await otherPage.request.post('/dev/calendar', {
      data: {
        accountId: owner.accountId,
        email: 'foreign-account@example.test',
        authFailure: true,
      },
    })
    expect(response.status()).toBe(403)
    expect(
      await (
        await page.request.get(`/dev/calendar?accountId=${owner.accountId}`)
      ).json(),
    ).toEqual(state)
    const session = (await context.cookies()).find((cookie) =>
      cookie.name.endsWith('session_token'),
    )
    expect(session).toBeDefined()
    expect(session!.httpOnly).toBe(true)
    expect(session!.sameSite).toBe('Lax')
    for (const endpoint of ['get-session', 'list-accounts']) {
      const result = await page.request.get(`/api/auth/${endpoint}`)
      expect(result.ok()).toBe(true)
      expect(await result.text()).not.toMatch(
        /"(?:accessToken|refreshToken|access_token|refresh_token|idToken)"\s*:\s*"[^"\s]+"/,
      )
    }
  } finally {
    await otherContext.close()
  }
})
