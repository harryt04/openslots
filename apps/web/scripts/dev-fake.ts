/**
 * Runs the app with no outside services: an in-memory MongoDB, the fake
 * calendar provider and the test sign-in at /dev/sign-in.
 *
 *   pnpm run dev:fake            # http://localhost:3000
 *   PORT=3105 pnpm run dev:fake  # pick a port when several worktrees run
 *
 * Playwright starts this same script (playwright.config.ts). Data is lost
 * when the process stops.
 */
import { spawn } from 'node:child_process'

import { MongoMemoryServer } from 'mongodb-memory-server'

async function main() {
  const port = process.env.PORT ?? '3000'
  const mongo = await MongoMemoryServer.create()
  const origin = `http://localhost:${port}`

  console.log(`[dev:fake] in-memory MongoDB at ${mongo.getUri()}`)
  console.log(
    `[dev:fake] app at ${origin}, test sign-in at ${origin}/dev/sign-in`,
  )

  const next = spawn('next', ['dev', '--port', port], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      E2E_FAKE_GOOGLE: '1',
      MONGO_CONNECTION_STRING: mongo.getUri(),
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        'dev-fake-secret-not-for-production!!',
    },
  })

  let stopping = false
  async function stop(code: number) {
    if (stopping) return
    stopping = true
    next.kill('SIGTERM')
    await mongo.stop()
    process.exit(code)
  }

  next.on('exit', (code) => void stop(code ?? 0))
  process.on('SIGINT', () => void stop(0))
  process.on('SIGTERM', () => void stop(0))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
