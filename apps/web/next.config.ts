import path from 'node:path'

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The Docker image runs Next's standalone server. Tracing starts at the
  // workspace root so the packages under packages/ are included.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // The workspace packages are consumed as TypeScript source during
  // development; their package.json `publishConfig` points npm at `dist`.
  transpilePackages: ['@openslots/core', '@openslots/react'],
  logging: {
    fetches: {
      fullUrl: true,
    },
    // A manage link is a bearer credential: whoever has it can cancel the
    // booking. Keep those paths out of the development request log. In
    // production, redact them in the reverse proxy's access log as well.
    incomingRequests: {
      ignore: [/^\/m\//, /^\/api\/v1\/manage\//],
    },
  },
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
      {
        source: '/ingest/decide',
        destination: 'https://us.i.posthog.com/decide',
      },
    ]
  },
  // Required to support PostHog trailing slash API requests.
  skipTrailingSlashRedirect: true,
}

export default nextConfig
