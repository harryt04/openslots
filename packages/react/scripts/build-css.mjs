#!/usr/bin/env node
/**
 * Compiles src/styles.css with Tailwind into dist/styles.css, then scopes it
 * so nothing can leak into or out of the host page (design checks C-1, C-4):
 *
 * - every selector is placed under the root class `.openslots`;
 *   `:root`, `:host`, `html` and `body` become `.openslots` itself;
 * - cascade layers are unwrapped, so the rules never join a host's
 *   `@layer base` or `@layer utilities` and the scoped specificity decides;
 * - `@property` registrations (global by nature) are dropped; the fallback
 *   block that gives `--tw-*` their initial values is kept, scoped;
 * - keyframes are renamed with an `openslots-` prefix;
 * - custom properties defined with color-mix() keep only that value, not
 *   Tailwind's fallback (see the comment in `scope`).
 *
 *   node scripts/build-css.mjs           # build once
 *   node scripts/build-css.mjs --watch   # build, then rebuild on change
 *
 * `buildCss()` is also imported by the tests.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { watch } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwind from '@tailwindcss/postcss'
import postcss from 'postcss'

export const ROOT = '.openslots'
const PREFIX = 'openslots-'

const here = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(here, '..')
const srcDir = path.join(packageDir, 'src')
const input = path.join(srcDir, 'styles.css')
const output = path.join(packageDir, 'dist', 'styles.css')

/** Places one selector under the root class. */
function scopeSelector(selector) {
  const s = selector.trim()
  if (s.includes(ROOT)) return s
  if (/^(:root|:host|html|body)$/.test(s)) return ROOT
  // `:root .x`, `html .x`, `body > .x`: the part after the global becomes
  // a descendant of the root.
  const global = /^(:root|:host|html|body)(?=[\s>+~])\s*/.exec(s)
  if (global) return `${ROOT} ${s.slice(global[0].length)}`
  return `${ROOT} ${s}`
}

/** The PostCSS plugin that does the scoping described above. */
export function scope() {
  return {
    postcssPlugin: 'openslots-scope',
    OnceExit(root) {
      // Unwrap layers from the inside out; drop empty layer statements.
      let found = true
      while (found) {
        found = false
        root.walkAtRules('layer', (rule) => {
          found = true
          if (rule.nodes) rule.replaceWith(rule.nodes)
          else rule.remove()
        })
      }
      root.walkAtRules('property', (rule) => rule.remove())
      // Tailwind wraps the `--tw-*` initial values in an @supports that only
      // matches browsers without @property. With @property gone, apply them
      // everywhere.
      root.walkAtRules('supports', (rule) => {
        if (rule.params.includes('-webkit-hyphens') && rule.nodes) {
          rule.replaceWith(rule.nodes)
        }
      })

      // Tailwind gives a custom property that uses color-mix() a fallback
      // (`--x: var(--primary)`) plus a nested `@supports` with the real
      // value. For the derived soft surfaces that fallback would paint the
      // full base color behind text; keep only the color-mix() value, so a
      // browser without color-mix() finds the property invalid and falls
      // through to the Voltage default.
      root.walkAtRules('supports', (rule) => {
        if (
          rule.parent?.type !== 'rule' ||
          !rule.params.includes('color-mix') ||
          !rule.nodes?.every(
            (n) => n.type === 'decl' && n.prop.startsWith('--'),
          )
        )
          return
        for (const decl of rule.nodes) {
          rule.parent.each((sibling) => {
            if (
              sibling !== rule &&
              sibling.type === 'decl' &&
              sibling.prop === decl.prop
            )
              sibling.remove()
          })
        }
        rule.replaceWith(rule.nodes)
      })

      const renamed = new Map()
      const seen = new Set()
      root.walkAtRules('keyframes', (rule) => {
        const name = rule.params.trim()
        const next = name.startsWith(PREFIX) ? name : `${PREFIX}${name}`
        if (next !== name) renamed.set(name, next)
        // Tailwind can emit the same keyframes twice; keep one.
        if (seen.has(next)) return void rule.remove()
        seen.add(next)
        rule.params = next
      })
      if (renamed.size) {
        root.walkDecls((decl) => {
          if (!/animation|^--/.test(decl.prop)) return
          for (const [from, to] of renamed) {
            decl.value = decl.value.replace(
              new RegExp(`(^|[\\s,])${from}(?=$|[\\s,])`, 'g'),
              `$1${to}`,
            )
          }
        })
      }

      root.walkRules((rule) => {
        // Keyframe steps (`from`, `to`, `50%`) are not selectors.
        if (
          rule.parent?.type === 'atrule' &&
          /keyframes$/.test(rule.parent.name)
        )
          return
        rule.selectors = [...new Set(rule.selectors.map(scopeSelector))]
      })

      root.walkComments((comment) => {
        if (!comment.text.startsWith('!')) comment.remove()
      })
    },
  }
}
scope.postcss = true

/** Compiles and scopes the stylesheet, returning the CSS text. */
export async function buildCss({ minify = false } = {}) {
  const source = await readFile(input, 'utf8')
  const result = await postcss([
    tailwind({ base: srcDir, optimize: minify ? { minify: true } : false }),
    scope(),
  ]).process(source, { from: input, to: output })
  return result.css
}

async function writeOnce() {
  const started = Date.now()
  const css = await buildCss()
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, css)
  const kb = (Buffer.byteLength(css) / 1024).toFixed(1)
  console.log(
    `[openslots/react] styles.css ${kb} kB in ${Date.now() - started} ms`,
  )
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  await writeOnce()
  if (process.argv.includes('--watch')) {
    let timer
    watch(srcDir, { recursive: true }, (_event, file) => {
      if (!file || !/\.(css|tsx?)$/.test(file) || /\.test\./.test(file)) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        writeOnce().catch((error) => console.error(error))
      }, 100)
    })
    console.log('[openslots/react] watching src for style changes')
  }
}
