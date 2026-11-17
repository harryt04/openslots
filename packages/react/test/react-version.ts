/**
 * Fails the run if the React it is meant to test is not the one loaded, so
 * the React 18 run cannot silently fall back to React 19.
 */
import { version } from 'react'
import { version as domVersion } from 'react-dom'
import { beforeAll, expect } from 'vitest'

beforeAll(() => {
  const expected = process.env.OPENSLOTS_EXPECT_REACT ?? '19'
  expect(version.split('.')[0]).toBe(expected)
  expect(domVersion.split('.')[0]).toBe(expected)
})
