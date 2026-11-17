import { test as base, expect, type BrowserContext } from '@playwright/test'

/** Observe real browser responses, including documents/RSC and Better Auth. */
export const test = base.extend<{ browserPayloadAudit: void }>({
  browserPayloadAudit: [
    async ({ browser, context }, use) => {
      const pending: Promise<void>[] = []
      const violations: string[] = []
      const observe = (target: BrowserContext) => {
        target.on('response', (response) => {
          pending.push(
            (async () => {
              let body: string
              try {
                body = (await response.body()).toString('utf8')
              } catch {
                return /* Aborted response/navigation has no delivered body. */
              }
              // JSON and HTML/RSC escapes both carry literal valued token fields.
              if (
                body.includes('fake-access-token-e2e-only') ||
                body.includes('fake-refresh-token-e2e-only')
              )
                violations.push('fake OAuth credential')
              const normalized = body.replaceAll('\\"', '"')
              if (
                /"(?:accessToken|refreshToken|access_token|refresh_token|idToken)"\s*:\s*"[^"\s]+"/.test(
                  normalized,
                )
              ) {
                // Keep credentials and bearer paths out of the failure report.
                violations.push(
                  new URL(response.url()).pathname.startsWith('/api/auth/')
                    ? 'auth response'
                    : 'browser response',
                )
              }
            })(),
          )
        })
      }
      observe(context)
      const original = browser.newContext.bind(browser)
      browser.newContext = async (...args) => {
        const target = await original(...args)
        observe(target)
        return target
      }
      try {
        await use()
      } finally {
        browser.newContext = original
        await Promise.all(pending)
        expect(
          violations,
          'OAuth token fields must never be delivered to the browser',
        ).toEqual([])
      }
    },
    { auto: true },
  ],
})
