/**
 * Usage: node apps/web/scripts/contrast.mjs URL light|dark [output-prefix]
 * Requires Playwright Chromium. Measures viewport text against rendered pixels,
 * including gradients and ancestor opacity. Run separately for each state/scroll.
 * Background and solid-ink screenshots avoid anti-aliasing as WCAG requires.
 * Placeholder/pseudo-element text, frames and shadow roots are explicitly excluded.
 */
import { chromium } from '@playwright/test'
import { inflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

// Chromium emits 8-bit RGB/RGBA PNGs. Fail closed for other encodings.
function decode(buffer) {
  let width, height, channels
  const chunks = []
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0
      if (data[8] !== 8 || !channels || data[12]) throw Error('Unsupported PNG')
    }
    if (type === 'IDAT') chunks.push(data)
    offset += length + 12
  }
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  let offset = 0
  const paeth = (a, b, c) => {
    const p = a + b - c
    const distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
    return distances[0] <= distances[1] && distances[0] <= distances[2]
      ? a
      : distances[1] <= distances[2]
        ? b
        : c
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++]
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x
      const a = x >= channels ? pixels[index - channels] : 0
      const b = y ? pixels[index - stride] : 0
      const c = y && x >= channels ? pixels[index - stride - channels] : 0
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][
        filter
      ]
      if (prediction === undefined) throw Error('Unsupported PNG filter')
      pixels[index] = (raw[offset++] + prediction) & 255
    }
  }
  return {
    width,
    height,
    pixel: (x, y) => [
      ...pixels.subarray(
        (y * width + x) * channels,
        (y * width + x) * channels + 3,
      ),
    ],
  }
}
const luminance = (rgb) =>
  rgb
    .map((v) => {
      v /= 255
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05)

export async function measureContrast(page) {
  await page.evaluate(() => document.fonts.ready)
  const hideDevTools = await page.addStyleTag({
    content:
      'nextjs-portal { display: none !important } *, *::before, *::after { transition: none !important; animation: none !important }',
  })
  // Wrappers preserve inline metrics. Solid ink is painted inside the original
  // opacity/stacking ancestry, letting Chromium composite it over the actual page.
  const records = await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    )
    const nodes = []
    while (walker.nextNode()) nodes.push(walker.currentNode)
    return nodes.flatMap((node) => {
      const parent = node.parentElement
      if (
        !parent ||
        !node.textContent.trim() ||
        parent.closest(
          'script,style,noscript,svg,nextjs-portal,.sr-only,[aria-hidden="true"],:disabled,[aria-disabled="true"]',
        )
      )
        return []
      const style = getComputedStyle(parent)
      const range = document.createRange()
      range.selectNodeContents(node)
      const rects = [...range.getClientRects()].filter(
        (r) =>
          r.width > 2 &&
          r.height > 2 &&
          r.bottom > 0 &&
          r.top < innerHeight &&
          r.right > 0 &&
          r.left < innerWidth &&
          (() => {
            const hit = document.elementFromPoint(
              Math.max(0, Math.min(innerWidth - 1, r.x + r.width / 2)),
              Math.max(0, Math.min(innerHeight - 1, r.y + r.height / 2)),
            )
            return hit && (parent.contains(hit) || hit.contains(parent))
          })(),
      )
      if (
        !rects.length ||
        style.visibility !== 'visible' ||
        style.display === 'none'
      )
        return []
      const id = document.querySelectorAll('[data-contrast-ink]').length
      const span = document.createElement('span')
      span.dataset.contrastInk = String(id)
      span.style.setProperty('visibility', 'hidden', 'important')
      node.replaceWith(span)
      span.append(node)
      return [
        {
          id,
          text: node.textContent.trim(),
          selector: parent.id
            ? `#${parent.id}`
            : `${parent.tagName.toLowerCase()}.${[...parent.classList].join('.')}`,
          color: style.color,
          size: parseFloat(style.fontSize),
          weight: parseInt(style.fontWeight),
          rects: rects.map((r) => {
            let left = r.left,
              right = r.right,
              top = r.top,
              bottom = r.bottom
            for (
              let ancestor = parent;
              ancestor;
              ancestor = ancestor.parentElement
            ) {
              const computed = getComputedStyle(ancestor)
              const box = ancestor.getBoundingClientRect()
              if (
                ['hidden', 'clip', 'auto', 'scroll'].includes(
                  computed.overflowX,
                )
              ) {
                left = Math.max(left, box.left)
                right = Math.min(right, box.right)
              }
              if (
                ['hidden', 'clip', 'auto', 'scroll'].includes(
                  computed.overflowY,
                )
              ) {
                top = Math.max(top, box.top)
                bottom = Math.min(bottom, box.bottom)
              }
            }
            return {
              x: left,
              y: top,
              width: Math.max(0, right - left),
              height: Math.max(0, bottom - top),
            }
          }),
        },
      ]
    })
  })
  try {
    const background = decode(await page.screenshot({ animations: 'disabled' }))
    await page.evaluate((records) => {
      for (const record of records) {
        const span = document.querySelector(
          `[data-contrast-ink="${record.id}"]`,
        )
        span.style.setProperty('visibility', 'visible', 'important')
        span.style.setProperty('color', 'transparent', 'important')
        span.style.setProperty('text-shadow', 'none', 'important')
        span.style.setProperty('background', record.color, 'important')
        span.style.setProperty('box-decoration-break', 'clone')
      }
    }, records)
    const foreground = decode(await page.screenshot({ animations: 'disabled' }))
    return records.map((record) => {
      let worst = { ratio: Infinity }
      for (const rect of record.rects) {
        for (
          let y = Math.max(0, Math.ceil(rect.y) + 2);
          y < Math.min(background.height, Math.floor(rect.y + rect.height) - 2);
          y++
        ) {
          for (
            let x = Math.max(0, Math.ceil(rect.x) + 2);
            x < Math.min(background.width, Math.floor(rect.x + rect.width) - 2);
            x++
          ) {
            const bg = background.pixel(x, y),
              fg = foreground.pixel(x, y)
            const value = ratio(bg, fg)
            if (value < worst.ratio)
              worst = { ratio: value, foreground: fg, background: bg }
          }
        }
      }
      const threshold =
        record.size >= 24 || (record.size >= 18.6667 && record.weight >= 700)
          ? 3
          : 4.5
      return {
        ...record,
        rects: undefined,
        ...worst,
        threshold,
        passes: worst.ratio >= threshold,
      }
    })
  } finally {
    await page.evaluate(() =>
      document
        .querySelectorAll('[data-contrast-ink]')
        .forEach((span) => span.replaceWith(...span.childNodes)),
    )
    await hideDevTools.evaluate((element) => element.remove())
  }
}

if (process.argv[1]?.endsWith('/contrast.mjs')) {
  const [url, mode = 'light', prefix = '/tmp/contrast'] = process.argv.slice(2)
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
    })
    await page.goto(url)
    await page.evaluate((mode) => localStorage.setItem('theme', mode), mode)
    await page.reload()
    await page.screenshot({ path: `${prefix}.png` })
    const report = {
      url,
      mode,
      exclusions: [
        'placeholder and pseudo-element text',
        'shadow roots',
        'iframes',
        'offscreen text',
      ],
      text: await measureContrast(page),
    }
    writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await browser.close()
  }
}
