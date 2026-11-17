/** Runs against the existing production build; CI builds with a dummy analytics key. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { MongoMemoryServer } from 'mongodb-memory-server'

async function main() {
  const port = process.env.PORT ?? '3251'
  const origin = `http://localhost:${port}`
  const mongo = await MongoMemoryServer.create()
  async function start(fake: boolean) {
    let output = ''
    const child = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '--port', port],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          E2E_FAKE_GOOGLE: fake ? '1' : '',
          MONGO_CONNECTION_STRING: mongo.getUri(),
          BETTER_AUTH_URL: origin,
          BETTER_AUTH_SECRET: 'production-smoke-placeholder-32-characters',
          GOOGLE_CLIENT_ID: 'placeholder',
          GOOGLE_CLIENT_SECRET: 'placeholder',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    child.stdout.on('data', (data) => {
      output += String(data)
    })
    child.stderr.on('data', (data) => {
      output += String(data)
    })
    child.on('error', (error) => {
      output += String(error)
    })
    const stop = async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit')
        child.kill('SIGTERM')
        await exited
      }
    }
    try {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (child.exitCode !== null) {
          assert(fake && /E2E_FAKE_GOOGLE/.test(output), output)
          return { child, stop, output: () => output, early: true }
        }
        if (output.includes('Ready in'))
          return { child, stop, output: () => output, early: false }
        await delay(100)
      }
      throw Error(`Production server did not become ready: ${output}`)
    } catch (error) {
      await stop()
      throw error
    }
  }
  try {
    const server = await start(false)
    try {
      assert(!server.early)
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        const analytics: string[] = []
        page.on('request', (request) => {
          const url = new URL(request.url())
          if (
            url.pathname.startsWith('/ingest') ||
            /posthog/i.test(url.hostname)
          )
            analytics.push(request.url())
        })
        for (const path of [
          '/login',
          '/b/unknown-smoke-business',
          '/m/' + 'x'.repeat(43),
        ]) {
          await page.goto(origin + path)
          await page.waitForLoadState('networkidle')
        }
        assert.deepEqual(
          analytics,
          [],
          'Public pages must never request analytics',
        )
        for (const path of [
          '/dev/calendar',
          '/dev/gallery',
          '/dev/gallery/openslots.css',
          '/dev/sign-in',
          '/dev/tokens',
        ]) {
          for (const method of path === '/dev/calendar'
            ? ['GET', 'PUT', 'POST']
            : ['GET']) {
            const response = await fetch(origin + path, { method })
            assert.equal(response.status, 404, `${method} ${path}`)
          }
        }
        console.log(
          'Production public analytics and dev-route isolation: passed',
        )
      } finally {
        await browser.close()
      }
    } finally {
      await server.stop()
    }
    const fake = await start(true)
    try {
      let how = 'at startup'
      if (!fake.early) {
        // The server prints "Ready" a moment before its start-up check stops
        // the process, so a request here either fails because the process
        // has gone, or (on a build that only refuses on first use) gets a
        // server error. Anything else means fake mode is running.
        const response = await fetch(origin + '/api/auth/get-session').catch(
          () => null,
        )
        if (response) {
          assert(
            response.status >= 500,
            `Fake auth was not refused: ${response.status}`,
          )
          how = 'on first auth use'
        } else {
          for (let i = 0; i < 100 && fake.child.exitCode === null; i++)
            await delay(100)
          assert.notEqual(
            fake.child.exitCode,
            null,
            'The server kept running in fake mode',
          )
          assert.notEqual(fake.child.exitCode, 0)
        }
        assert.match(fake.output(), /E2E_FAKE_GOOGLE/)
      }
      console.log(`Production fake-mode refusal: ${how}`)
    } finally {
      await fake.stop()
    }
  } finally {
    await mongo.stop()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
