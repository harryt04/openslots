import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'react-19',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    exclude: ['test/react-18/**'],
    environment: 'jsdom',
    setupFiles: ['test/setup.ts', 'test/react-version.ts'],
    env: { OPENSLOTS_EXPECT_REACT: '19' },
  },
})
