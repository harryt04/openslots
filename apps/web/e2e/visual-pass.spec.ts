import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSalon, chooseTime, fillDetails } from './support/salon'

test('automated visual state inventory', async ({ page, browser }) => {
  test.skip(process.env.VISUAL_PASS !== '1', 'Opt-in artifact generation')
  const { measureContrast } = await new Function('path', 'return import(path)')(
    resolve('scripts/contrast.mjs'),
  )
  test.setTimeout(1_800_000)
  page.setDefaultTimeout(20000)
  const directory = resolve('../../.screenshots')
  mkdirSync(directory, { recursive: true })
  const results: unknown[] = []
  const save = () =>
    writeFileSync(
      resolve(directory, 'visual-pass.json'),
      JSON.stringify(results, null, 2),
    )
  const salon = await createSalon(page, {
    name: 'Shear Bliss Salon',
    slug: 'shear-bliss',
    services: [
      { name: 'Trim', minutes: 30 },
      { name: 'Cut and style', minutes: 60 },
      { name: 'Full color', minutes: 180 },
    ],
  })
  await page.goto('/services')
  const editor = await page
    .getByRole('link', { name: 'Edit Full color' })
    .getAttribute('href')
  await page.goto('/developers')
  const key = await page
    .getByLabel('Publishable key', { exact: true })
    .inputValue()
  const headers = { 'X-OpenSlots-Key': key }
  const business = await (
    await page.request.get('/api/v1/business', { headers })
  ).json()
  const from = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const to = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const slots = await (
    await page.request.get(
      `/api/v1/slots?service=${business.services[0].id}&from=${from}&to=${to}&tz=UTC`,
      { headers },
    )
  ).json()
  const times = Object.values(slots.days).flat() as string[]
  const bookings = []
  for (const start of [times[0], times.at(-1)]) {
    bookings.push(
      await (
        await page.request.post('/api/v1/bookings', {
          headers,
          data: {
            serviceId: business.services[0].id,
            start,
            timezone: 'UTC',
            customer: { name: 'Visual Customer', email: 'visual@example.test' },
            note: 'Visual fixture note',
          },
        })
      ).json(),
    )
  }
  await page.request.post(
    `/api/v1/manage/${bookings[1].manageUrl.split('/').pop()}/cancel`,
    { headers, data: {} },
  )
  await page.goto('/availability')
  await page.getByRole('switch', { name: 'Monday', exact: true }).click()
  for (const day of ['Tuesday', 'Wednesday', 'Friday'])
    await page.getByLabel(`${day} end`, { exact: true }).fill('6 PM')
  await page.getByLabel('Thursday end', { exact: true }).fill('12:30 PM')
  await page
    .getByRole('button', { name: 'Add another time range for Thursday' })
    .click()
  await page.getByLabel('Thursday range 2 start').fill('1:30 PM')
  await page.getByLabel('Thursday range 2 end').fill('8 PM')
  await page.getByRole('switch', { name: 'Saturday', exact: true }).click()
  await page.getByLabel('Saturday start', { exact: true }).fill('10 AM')
  await page.getByLabel('Saturday end', { exact: true }).fill('3 PM')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.goto('/services')
  await page.getByRole('switch', { name: 'Bookable: Full color' }).click()
  const manage = bookings[0].manageUrl
  const guest = await browser.newContext()
  const login = await guest.newPage()
  const flow = () => page.locator('.openslots').first()
  const time = async () => {
    await page.goto('/b/shear-bliss/trim')
    await chooseTime(flow())
  }
  const details = async () => {
    await time()
    await flow().getByRole('button', { name: 'Continue' }).click()
  }
  type State = {
    id: string
    url: string
    action?: () => Promise<unknown>
    target?: Page
  }
  const states: State[] = [
    { id: 'S1-login', url: '/login', target: login },
    { id: 'S2-list', url: '/' },
    ...['details', 'cancel', 'reschedule'].map((kind) => ({
      id: `S2-${kind}`,
      url: '/',
      action: async () => {
        await page
          .getByRole('button', { name: /Visual Customer/ })
          .first()
          .click()
        if (kind !== 'details')
          await page
            .getByRole('button', {
              name: kind === 'cancel' ? 'Cancel booking' : 'Reschedule',
              exact: true,
            })
            .click()
      },
    })),
    {
      id: 'S2-cancelled-tab',
      url: '/?status=cancelled',
      action: async () =>
        page.getByRole('link', { name: 'Cancelled', exact: true }).click(),
    },
    {
      id: 'S2-switcher',
      url: '/',
      action: async () =>
        page.getByRole('button', { name: /Switch business/ }).click(),
    },
    { id: 'S1-onboarding', url: '/onboarding' },
    { id: 'S2-settings', url: '/settings' },
    { id: 'S3-list', url: '/services' },
    { id: 'S4-editor', url: editor! },
    {
      id: 'S4-invalid',
      url: editor!,
      action: async () => {
        await page.getByRole('radio', { name: 'Custom', exact: true }).click()
        await page.getByLabel('Custom duration in minutes').fill('62')
        await page.getByRole('button', { name: 'Save changes' }).click()
      },
    },
    { id: 'S4-new', url: '/services/new' },
    { id: 'S5-weekly', url: '/availability' },
    {
      id: 'S5-override',
      url: '/availability',
      action: async () =>
        page.getByRole('button', { name: 'Add', exact: true }).click(),
    },
    {
      id: 'S5-invalid',
      url: '/availability',
      action: async () => {
        await page
          .getByLabel('Thursday range 1 end', { exact: true })
          .fill('8 AM')
        await page.getByRole('button', { name: 'Save changes' }).click()
      },
    },
    { id: 'S6-calendars', url: '/calendars' },
    { id: 'S7-developers', url: '/developers' },
    {
      id: 'S7-rotate',
      url: '/developers',
      action: async () =>
        page.getByRole('button', { name: 'Rotate key' }).click(),
    },
    {
      id: 'S7-invalid',
      url: '/developers',
      action: async () => {
        await page.getByLabel('Site origin').fill('bad')
        await page.getByRole('button', { name: 'Add site' }).click()
      },
    },
    { id: 'S8-services', url: '/b/shear-bliss' },
    { id: 'S8-time', url: '/b/shear-bliss/trim', action: time },
    { id: 'S8-details', url: '/b/shear-bliss/trim', action: details },
    {
      id: 'S8-invalid',
      url: '/b/shear-bliss/trim',
      action: async () => {
        await details()
        await flow().getByRole('button', { name: 'Confirm booking' }).click()
      },
    },
    { id: 'S8-not-found', url: '/b/no-such-business' },
    {
      id: 'S9-phone',
      url: '/dev/gallery',
      action: async () =>
        page.getByTestId('phone-frame').scrollIntoViewIfNeeded(),
    },
    {
      id: 'C1-host',
      url: '/dev/gallery',
      action: async () =>
        page.locator('iframe').first().scrollIntoViewIfNeeded(),
    },
    { id: 'S10-confirmed', url: manage },
    {
      id: 'S10-reschedule',
      url: manage,
      action: async () =>
        page.getByRole('button', { name: 'Reschedule', exact: true }).click(),
    },
    {
      id: 'S10-cancel',
      url: manage,
      action: async () =>
        page
          .getByRole('button', { name: 'Cancel booking', exact: true })
          .click(),
    },
  ]
  states.push(
    {
      id: 'S8-confirmation',
      url: '/b/shear-bliss/trim',
      action: async () => {
        await details()
        await fillDetails(flow(), {
          name: 'Screenshot Customer',
          email: 'shot@example.test',
        })
        await flow().getByRole('button', { name: 'Confirm booking' }).click()
        await expect(
          flow().getByRole('heading', { name: "You're booked" }),
        ).toBeVisible()
      },
    },
    { id: 'S10-cancelled', url: bookings[1].manageUrl },
    {
      id: 'S6-reconnect',
      url: '/calendars',
      action: async () => {
        if (
          await page
            .getByRole('button', { name: 'Link another Google account' })
            .count()
        ) {
          await page
            .getByRole('button', { name: 'Link another Google account' })
            .click()
          const section = page
            .locator('section')
            .filter({ has: page.locator('h2') })
            .last()
          const email = await section.locator('h2').innerText()
          await page.request.post('/dev/calendar', {
            data: { email, authFailure: true },
          })
          await section
            .getByRole('button', { name: 'Refresh', exact: true })
            .click()
        }
      },
    },
    { id: 'S2-calendar-banner', url: '/' },
    {
      id: 'S6-no-booking-calendar',
      url: '/calendars',
      action: async () => {
        await page.request.put(`/dev/calendar?accountId=${salon.accountId}`, {
          data: {
            calendars: [
              {
                id: 'primary',
                summary: 'Read only',
                accessRole: 'reader',
                primary: true,
              },
            ],
          },
        })
        await page
          .getByRole('button', { name: 'Refresh', exact: true })
          .first()
          .click()
      },
    },
  )
  let empty = false
  for (const [id, url] of [
    ['S2-empty', '/'],
    ['S3-empty', '/services'],
    ['S6-not-connected', '/calendars'],
  ] as const)
    states.push({
      id,
      url,
      action: async () => {
        if (!empty) {
          await page.getByRole('button', { name: /Switch business/ }).click()
          await page.getByRole('menuitem', { name: 'Add a business' }).click()
          await page.getByLabel('Business name').fill('Empty business')
          await page
            .getByLabel('Booking page address')
            .fill(`empty-${Date.now()}`)
          await page.getByRole('button', { name: 'Add business' }).click()
          await expect(page).toHaveURL(/availability/)
          empty = true
        }
        await page.goto(url)
      },
    })
  for (const state of states)
    for (const [mode, width] of [
      ['light', 1280],
      ['dark', 1280],
      ['light', 390],
    ] as const) {
      const p = state.target ?? page
      const record: Record<string, unknown> = { id: state.id, mode, width }
      try {
        await p.setViewportSize({ width, height: 900 })
        await p.goto(
          state.url.startsWith('/')
            ? `http://localhost:${process.env.E2E_PORT ?? '3262'}${state.url}`
            : state.url,
        )
        await p.evaluate((mode) => {
          localStorage.setItem('theme', mode)
          document.documentElement.classList.toggle('dark', mode === 'dark')
          document.documentElement.classList.toggle('light', mode === 'light')
        }, mode)
        if (
          (state.id === 'S2-switcher' || state.id.endsWith('empty')) &&
          width === 390
        ) {
          const toggle = page.getByRole('button', { name: 'Toggle Sidebar' })
          if (await toggle.isVisible()) await toggle.click()
        }
        await state.action?.()
        await p.waitForTimeout(700)
        await p.evaluate((mode) => {
          document.documentElement.classList.toggle('dark', mode === 'dark')
          document.documentElement.classList.toggle('light', mode === 'light')
        }, mode)
        await p.addStyleTag({
          content: 'nextjs-portal { display: none !important }',
        })
        await p.screenshot({
          path: resolve(directory, `${state.id}-${mode}-${width}.png`),
          fullPage: true,
          animations: 'disabled',
        })
        record.reached = true
        const contrast = await measureContrast(p)
        record.lowestRatio = Math.min(
          ...contrast.map((r: { ratio: number }) => r.ratio),
        )
        record.contrastFailures = contrast.filter(
          (r: { passes: boolean }) => !r.passes,
        )
        record.layout = await p.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          bodyFont: getComputedStyle(document.body).fontFamily,
          mono: [...document.querySelectorAll('time,code,pre,.font-mono')]
            .slice(0, 10)
            .map((el) => ({
              text: el.textContent?.slice(0, 80),
              font: getComputedStyle(el).fontFamily,
            })),
        }))
        record.states = await p.evaluate(() =>
          [
            ...document.querySelectorAll(
              '[data-status],[aria-pressed],[aria-checked],[aria-selected],[aria-current],[aria-invalid],[disabled]',
            ),
          ]
            .filter((el) => el.getClientRects().length)
            .map((el) => {
              const s = getComputedStyle(el)
              const other = [...(el.parentElement?.children ?? [])].find(
                (e) =>
                  e !== el &&
                  e.getAttribute('aria-selected') !==
                    el.getAttribute('aria-selected'),
              )
              const shape =
                other &&
                (getComputedStyle(other).borderWidth !== s.borderWidth ||
                  getComputedStyle(other).fontWeight !== s.fontWeight)
              const label =
                /confirmed|cancelled|paused|rescheduled|closed|selected|invalid|error|unavailable|reconnect|connected|today/i.test(
                  el.textContent ?? '',
                )
              const carrier =
                !!el.querySelector('svg') ||
                label ||
                s.textDecorationLine !== 'none' ||
                !!shape
              return {
                tag: el.tagName,
                text: el.textContent?.slice(0, 100),
                attributes: Object.fromEntries(
                  [...el.attributes]
                    .filter((a) => /^(aria-|data-status|disabled)/.test(a.name))
                    .map((a) => [a.name, a.value]),
                ),
                carrier,
              }
            }),
        )
        await p.evaluate(() =>
          document
            .querySelectorAll(
              'button,a,input,select,[role=switch],[role=radio],[role=tab]',
            )
            .forEach((el, i) => el.setAttribute('data-visual-id', String(i))),
        )
        const stops = []
        for (let i = 0; i < 60; i++) {
          await p.keyboard.press('Tab')
          stops.push(
            await p.evaluate(() => {
              const el = document.activeElement!
              const s = getComputedStyle(el)
              const probe = document.createElement('span')
              probe.style.color = 'var(--ring)'
              const container = el.parentElement ?? document.body
              container.appendChild(probe)
              const ring = getComputedStyle(probe).color
              probe.remove()
              return {
                id: el.getAttribute('data-visual-id'),
                role: el.getAttribute('role') ?? el.tagName.toLowerCase(),
                name:
                  el.getAttribute('aria-label') ??
                  el.textContent?.slice(0, 100),
                width: s.outlineWidth,
                style: s.outlineStyle,
                color: s.outlineColor,
                ring,
                failure:
                  el !== document.body &&
                  (s.outlineWidth !== '2px' ||
                    s.outlineStyle !== 'solid' ||
                    s.outlineColor !== ring),
              }
            }),
          )
          const last = stops.at(-1)
          if (
            last &&
            stops
              .slice(0, -1)
              .some(
                (stop) =>
                  stop.id === last.id &&
                  stop.role === last.role &&
                  stop.name === last.name,
              )
          )
            break
        }
        record.focus = stops
        record.unreachedControls = await p.evaluate(
          (ids) =>
            [...document.querySelectorAll<HTMLElement>('[data-visual-id]')]
              .filter(
                (el) =>
                  el.getClientRects().length &&
                  !el.matches(':disabled') &&
                  !ids.includes(el.dataset.visualId ?? ''),
              )
              .map((el) => ({
                id: el.dataset.visualId,
                text: el.textContent?.slice(0, 80),
                tabIndex: el.tabIndex,
              })),
          stops.map((s) => s.id ?? ''),
        )
        if (mode === 'light' && width === 1280) {
          const cdp = await p.context().newCDPSession(p)
          await cdp.send('Emulation.setEmulatedVisionDeficiency', {
            type: 'achromatopsia',
          })
          await p.screenshot({
            path: resolve(directory, `${state.id}-achromatopsia.png`),
            fullPage: true,
          })
          await cdp.send('Emulation.setEmulatedVisionDeficiency', {
            type: 'none',
          })
          await cdp.detach()
        }
      } catch (error) {
        record.reached = false
        record.error = String(error)
      }
      results.push(record)
      save()
    }
  await guest.close()
  expect(results.length).toBe(states.length * 3)
})
