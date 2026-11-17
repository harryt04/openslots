/**
 * The same component and client tests, against React 18 (the package's
 * peer range is `^18 || ^19`). React 18, react-dom 18 and a
 * @testing-library/react whose peers resolve to them live in the private
 * workspace package test/react-18; every import of those is pointed there.
 * The checks over dist/ do not depend on React and run once, in the main
 * config.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const here = path.dirname(fileURLToPath(import.meta.url))
const react18 = createRequire(path.join(here, 'test/react-18/package.json'))
const dir = (name: string) =>
  path.dirname(react18.resolve(`${name}/package.json`))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^react$/, replacement: path.join(dir('react'), 'index.js') },
      { find: /^react\/(.*)$/, replacement: `${dir('react')}/$1` },
      {
        find: /^react-dom$/,
        replacement: path.join(dir('react-dom'), 'index.js'),
      },
      { find: /^react-dom\/(.*)$/, replacement: `${dir('react-dom')}/$1` },
      {
        find: /^@testing-library\/react$/,
        replacement: dir('@testing-library/react'),
      },
    ],
  },
  test: {
    name: 'react-18',
    include: ['test/**/*.test.{ts,tsx}'],
    exclude: ['test/build.test.ts', 'test/react-18/**'],
    environment: 'jsdom',
    setupFiles: ['test/setup.ts', 'test/react-version.ts'],
    env: { OPENSLOTS_EXPECT_REACT: '18' },
  },
})
