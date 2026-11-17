import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The workspace packages are consumed as TypeScript source during
  // development; their package.json `publishConfig` points npm at `dist`.
  transpilePackages: ['@openslots/core', '@openslots/react'],
  logging: {
    fetches: {
      fullUrl: true,
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
