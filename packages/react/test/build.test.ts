/**
 * Checks over the built package in dist/ (C-1, C-3, C-4). `pnpm test` builds
 * first; run `pnpm --filter @openslots/react build` before `vitest` alone.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import postcss, { type AtRule, type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'

// @ts-expect-error: a plain .mjs script without types.
import { scope } from '../scripts/build-css.mjs'

const dist = path.resolve(__dirname, '..', 'dist')
const read = (file: string) => {
  const full = path.join(dist, file)
  if (!existsSync(full)) {
    throw new Error(
      `${full} is missing: run pnpm --filter @openslots/react build`,
    )
  }
  return readFileSync(full, 'utf8')
}

/** Problems with a stylesheet that should be fully scoped under `.openslots`. */
function leaks(css: string): string[] {
  const problems: string[] = []
  const root = postcss.parse(css)
  const allowedAtRules = new Set([
    'media',
    'container',
    'supports',
    'keyframes',
  ])
  root.walkAtRules((rule: AtRule) => {
    if (!allowedAtRules.has(rule.name))
      problems.push(`@${rule.name} ${rule.params}`)
    if (rule.name === 'keyframes' && !rule.params.startsWith('openslots-')) {
      problems.push(`@keyframes ${rule.params}`)
    }
    if (rule.name === 'container' && /^[a-z-]+\s*\(/i.test(rule.params)) {
      problems.push(`named @container ${rule.params}`)
    }
  })
  root.walkRules((rule: Rule) => {
    const parent = rule.parent
    if (parent?.type === 'atrule' && (parent as AtRule).name === 'keyframes')
      return
    for (const selector of rule.selectors) {
      if (!/(^|[\s>+~(])\.openslots(?![\w-])/.test(selector)) {
        problems.push(`unscoped selector: ${selector}`)
      }
      if (
        /(^|[\s,>+~(]):root\b|(^|[\s,>+~(])(html|body)(?![\w-])/.test(selector)
      ) {
        problems.push(`global element selector: ${selector}`)
      }
      // The root class must not only be an ancestor test of someone else's
      // element: every selector's subject is .openslots or inside it.
      const subject = selector.split(/\s*[>+~]\s*|\s+/).pop() ?? ''
      if (subject.startsWith('.dark'))
        problems.push(`selects the host: ${selector}`)
    }
  })
  return problems
}

describe('dist/styles.css', () => {
  const css = read('styles.css')

  it('scopes every rule under .openslots and leaks no global at-rule (C-4)', () => {
    expect(leaks(css)).toEqual([])
  })

  it('has no cascade layers, @property, @font-face or @import', () => {
    expect(css).not.toMatch(/@(layer|property|font-face|import)\b/)
  })

  it('carries the Voltage defaults behind the shadcn token names (C-2)', () => {
    expect(css).toContain('var(--primary, var(--openslots-default-primary))')
    expect(css).toContain('var(--accent, var(--openslots-default-accent))')
    expect(css).toContain('--openslots-default-primary: #5b34f5')
    expect(css).toContain('--openslots-default-primary: #8b70ff')
  })

  it('switches at 760px of its own width, not the window (S9-1)', () => {
    expect(css).toMatch(/@container \(width >= 760px\)/)
    expect(css).not.toMatch(/@media[^{]*width/)
  })

  it('catches leaks when given hostile input', async () => {
    const result = await postcss([scope()]).process(
      [
        ':root{--x:1}',
        'html,body{margin:0}',
        '@layer base{button{color:red}}',
        '@property --tw-a{syntax:"*";inherits:false}',
        '@keyframes spin{to{opacity:1}}',
        '.a{animation:spin 1s}',
      ].join('\n'),
      { from: undefined },
    )
    expect(leaks(result.css)).toEqual([])
    expect(result.css).toContain('.openslots button')
    expect(result.css).toContain('openslots-spin 1s')
    // And the checker itself notices an unscoped rule.
    expect(leaks('.btn{color:red} body{margin:0}')).toHaveLength(3)
  })
})

describe('dist/index.js', () => {
  const js = read('index.js')

  it('starts with the "use client" directive (C-3)', () => {
    expect(js).toMatch(/^['"]use client['"];/)
  })

  it('imports only react and @openslots/core, never next', () => {
    const specifiers = [
      ...js.matchAll(/(?:^|\n)\s*import[^'"]*['"]([^'"]+)['"]/g),
    ].map((m) => m[1])
    expect(specifiers.length).toBeGreaterThan(0)
    for (const s of specifiers) {
      expect(s).toMatch(/^(react|react\/jsx-runtime|@openslots\/core)$/)
    }
    expect(js).not.toMatch(/from\s*['"]next|require\(['"]next/)
  })

  it('makes no requests of its own and loads nothing third-party', () => {
    // Only the client's own fetch, to the configured host.
    expect(js.match(/fetch\(/g)?.length ?? 0).toBeLessThanOrEqual(1)
    expect(js).not.toMatch(/https?:\/\/(?!slots\.example\.com|www\.w3\.org)/)
  })

  it('ships types', () => {
    const dts = read('index.d.ts')
    for (const name of [
      'BookingFlow',
      'SlotPicker',
      'ServiceList',
      'useBusiness',
      'useSlots',
      'createClient',
      'OpenSlotsError',
    ]) {
      expect(dts).toContain(name)
    }
  })
})

describe('package.json', () => {
  const pkg = JSON.parse(
    readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
  )

  it('has react 18 or 19 as peers only, and no Next.js or Tailwind at runtime', () => {
    expect(pkg.peerDependencies).toEqual({
      react: '^18 || ^19',
      'react-dom': '^18 || ^19',
    })
    expect(Object.keys(pkg.dependencies)).toEqual(['@openslots/core'])
  })

  it('publishes the stylesheet and keeps it from being tree-shaken', () => {
    expect(pkg.publishConfig.exports['./styles.css']).toBe('./dist/styles.css')
    expect(pkg.sideEffects).toEqual(['**/*.css'])
    expect(pkg.publishConfig.exports['./testing']).toBeUndefined()
  })
})
