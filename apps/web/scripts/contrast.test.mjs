import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { measureContrast } from './contrast.mjs'

test('rendered ink includes nested group opacity and translucent foreground over a gradient', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: 600, height: 200 },
    })
    await page.setContent(
      `<body style="margin:0;background:white"><div style="opacity:.5"><div style="opacity:.5;background:linear-gradient(to right,black,white);padding:20px"><span style="font:20px Arial;color:rgba(0,0,0,.5)">Transparent gradient sample</span></div></div></body>`,
    )
    const [result] = await measureContrast(page)
    assert.equal(result.text, 'Transparent gradient sample')
    assert.equal(result.threshold, 4.5)
    assert.equal(result.passes, false)
    // Background = .75 white + .25 gradient; ink = .75 white + .125 gradient.
    result.foreground.forEach((channel, i) =>
      assert.ok(
        Math.abs(channel - (191.25 + (result.background[i] - 191.25) / 2)) <= 2,
      ),
    )
    assert.ok(result.ratio > 1 && result.ratio < 1.3)
    assert.equal(await page.locator('[data-contrast-ink]').count(), 0)
    assert.equal(
      await page.locator('span').innerText(),
      'Transparent gradient sample',
    )
  } finally {
    await browser.close()
  }
})

test('large and bold text use the WCAG large-text thresholds', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(
      '<body style="background:white;color:black"><p style="font-size:24px">Large</p><p style="font-size:19px;font-weight:700">Bold</p><p style="font-size:19px">Normal</p></body>',
    )
    const rows = await measureContrast(page)
    assert.deepEqual(
      rows.map((r) => r.threshold),
      [3, 3, 4.5],
    )
    for (const row of rows) assert.equal(row.ratio, 21)
  } finally {
    await browser.close()
  }
})
