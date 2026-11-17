import { expect, test, type Locator, type Page } from '@playwright/test'

/*
 * @openslots/react in the development gallery (/dev/gallery), against the
 * in-memory mock API. Dates are whatever the mock offers from today on, so
 * the tests pick the first open day rather than a fixed date.
 */

const flow = (page: Page) => page.getByTestId('flow-frame')

async function open(page: Page, scheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto('/dev/gallery')
  await expect(flow(page).getByText('Choose a service')).toBeVisible()
}

async function firstOpenDay(scope: Locator): Promise<Locator> {
  const open = scope.locator(
    '[role=grid] button[data-date]:not([aria-disabled])',
  )
  // Step forward a month at a time until something is open.
  for (let i = 0; i < 3; i++) {
    await expect(scope.getByText('Loading open times…')).toHaveCount(0)
    if (await open.count()) return open.first()
    await scope.getByRole('button', { name: 'Next month' }).click()
  }
  throw new Error('no open day in three months')
}

test('books by mouse, from service to confirmation', async ({ page }) => {
  await open(page)
  const f = flow(page)
  await f.getByRole('button', { name: /Cut and style/ }).click()
  await expect(f.getByText('Step 2 of 4')).toBeVisible()
  await (await firstOpenDay(f)).click()
  await f.getByRole('group').getByRole('button').first().click()
  await f.getByRole('button', { name: 'Continue' }).click()
  await f.getByLabel('Name').fill('Alex Morgan')
  await f.getByLabel('Email').fill('alex@example.com')
  await f.getByRole('button', { name: 'Confirm booking' }).click()
  await expect(f.getByRole('heading', { name: "You're booked" })).toBeVisible()
  await expect(
    f.getByRole('link', { name: /Reschedule or cancel/ }),
  ).toHaveAttribute('href', /\/m\//)
})

test('books with the keyboard alone', async ({ page }) => {
  await open(page)
  const f = flow(page)
  const active = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return {
        tag: el?.tagName ?? '',
        text: el?.textContent?.trim() ?? '',
        date: el?.dataset.date ?? '',
        disabled: el?.getAttribute('aria-disabled') === 'true',
        pressed: el?.getAttribute('aria-pressed'),
        name: el?.getAttribute('name') ?? '',
      }
    })
  async function tabUntil(
    match: (a: Awaited<ReturnType<typeof active>>) => boolean,
  ) {
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
      if (match(await active())) return
    }
    throw new Error('focus never reached the target')
  }

  // Start just before the component, then only the keyboard.
  await page.getByRole('radio', { name: 'Success' }).focus()
  await tabUntil((a) => a.text.startsWith('Trim'))
  await page.keyboard.press('Enter')
  await expect(f.getByText('Step 2 of 4')).toBeVisible()
  await expect(f.getByText('Loading open times…')).toHaveCount(0)

  await tabUntil((a) => a.date !== '')
  // Walk the grid to an open day, a month ahead if need be.
  for (let i = 0; i < 70 && (await active()).disabled; i++) {
    await page.keyboard.press('ArrowRight')
    await expect(f.getByText('Loading open times…')).toHaveCount(0)
  }
  expect((await active()).disabled).toBe(false)
  await page.keyboard.press('Enter')
  await tabUntil((a) => a.pressed === 'false')
  await page.keyboard.press('Enter')
  expect((await active()).pressed).toBe('true')
  await tabUntil((a) => a.text.startsWith('Continue'))
  await page.keyboard.press('Enter')

  await expect(f.getByText('Step 3 of 4')).toBeVisible()
  await tabUntil((a) => a.name === 'name')
  await page.keyboard.type('Alex Morgan')
  await page.keyboard.press('Tab')
  await page.keyboard.type('alex@example.com')
  await tabUntil((a) => a.text === 'Confirm booking')
  await page.keyboard.press('Enter')
  await expect(f.getByRole('heading', { name: "You're booked" })).toBeFocused()
})

test('switches layout at 760px of its own width (S9-1)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page)
  const frame = page.getByTestId('resizable-frame')
  const grid = frame.locator('[data-step=time] > div').first()
  const columns = () =>
    grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
    )

  await page.getByLabel('Component width').fill('800')
  await expect.poll(columns).toBe(3)
  await page.getByLabel('Component width').fill('740')
  await expect.poll(columns).toBe(1)
  // Same window throughout: only the component's width changed.
  expect(page.viewportSize()?.width).toBe(1280)

  // Stacked order is summary, calendar, times (S9-2), times in a wrapping grid.
  const phone = page.getByTestId('phone-frame')
  await (await firstOpenDay(phone)).click()
  const times = phone.getByRole('group')
  const perRow = await times.evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
  )
  expect(perRow).toBeGreaterThan(1)
  for (const button of await phone.getByRole('button').all()) {
    const box = await button.boundingBox()
    if (box)
      expect(box.height, await button.innerText()).toBeGreaterThanOrEqual(38)
  }
})

for (const scheme of ['light', 'dark'] as const) {
  test(`uses the Voltage tokens in ${scheme} mode, in the app and a plain host`, async ({
    page,
  }) => {
    await open(page, scheme)
    const card = (scope: Locator) =>
      scope
        .locator('.openslots > div')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor)
    const expected =
      scheme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(20, 17, 39)'
    expect(await card(flow(page))).toBe(expected)

    // C1: the pretend host page has none of the app's CSS. It follows the
    // app's theme by toggling `.dark` on its own <html>, as next-themes does.
    const host = page.frameLocator('iframe[title="Pretend host page"]')
    await expect(host.getByText('Choose a service')).toBeVisible()
    await expect.poll(() => card(host.locator('body'))).toBe(expected)
  })
}

test('nothing leaks into or out of a hostile host page (C-4)', async ({
  page,
}) => {
  await open(page)
  const host = page.frameLocator('iframe[title="Pretend host page"]')
  const service = host.getByRole('button', { name: /Cut and style/ })
  await expect(service).toBeVisible()

  const style = await service.evaluate((el) => {
    const s = getComputedStyle(el)
    const icon = getComputedStyle(el.querySelector('svg')!)
    return {
      boxSizing: s.boxSizing,
      display: s.display,
      cursor: s.cursor,
      font: s.fontFamily,
      iconWidth: icon.width,
    }
  })
  expect(style).toEqual({
    boxSizing: 'border-box',
    display: 'flex',
    cursor: 'pointer',
    font: expect.not.stringMatching(/Georgia/),
    iconWidth: '16px',
  })

  // The host's own elements keep the host's styles.
  const hostButton = await host.locator('#host-button').evaluate((el) => {
    const s = getComputedStyle(el)
    return { border: s.borderTopStyle, transform: s.textTransform }
  })
  expect(hostButton).toEqual({ border: 'dashed', transform: 'uppercase' })
  expect(
    await host
      .locator('#host-title')
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toMatch(/Georgia/)
})
