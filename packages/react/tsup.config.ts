import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  // react and react-dom are peers; @openslots/core is a published dependency.
  external: ['react', 'react-dom', '@openslots/core'],
  // Every module here is a client component (C-3). The banner keeps the
  // directive at the top of the bundle, where bundlers look for it.
  banner: { js: "'use client';" },
})
