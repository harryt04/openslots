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
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { MongoMemoryServer } from 'mongodb-memory-server'

// One data directory per port, emptied at every start. When this script is
// killed outright (Playwright does that) it cannot clean up after itself, so
// instead of leaving a new 200 MB directory and a stray mongod behind each
// time, the next start on the same port removes the previous ones.
const dataDir = (port: string) => join(tmpdir(), `openslots-dev-fake-${port}`)
const pidFile = (port: string) => `${dataDir(port)}.pid`

function freshDataDir(port: string): string {
  const dir = dataDir(port)
  if (existsSync(pidFile(port))) {
    const pid = Number(readFileSync(pidFile(port), 'utf8'))
    try {
      // Only a mongod that is really serving this directory is stopped.
      const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      if (pid > 0 && command.includes(dir)) process.kill(pid, 'SIGKILL')
    } catch {
      // Not running, or not Linux: nothing to stop.
    }
  }
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}

async function main() {
  const port = process.env.PORT ?? '3000'
  const mongo = await MongoMemoryServer.create({
    instance: { dbPath: freshDataDir(port) },
  })
  writeFileSync(
    pidFile(port),
    String(mongo.instanceInfo?.instance.mongodProcess?.pid ?? ''),
  )
  const origin = `http://localhost:${port}`

  // Create the indexes on the fresh database before the app starts. The
  // modules read env at import time, so set it first and import after.
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.MONGO_CONNECTION_STRING = mongo.getUri()
  const { closeMongoClient, mongoDBConfig } =
    await import('../lib/mongo-client')
  const { createMongoDbIndexes } = await import('../lib/mongo-utils')
  await createMongoDbIndexes(mongoDBConfig.dbName)
  await closeMongoClient()

  // The app imports @openslots/react/styles.css, which is compiled from the
  // package's source. Build it once before Next starts, then keep it fresh.
  await run('pnpm', ['--filter', '@openslots/react', 'build:css'])
  const css = spawn('pnpm', ['--filter', '@openslots/react', 'dev'], {
    stdio: 'inherit',
  })

  console.log(`[dev:fake] in-memory MongoDB at ${mongo.getUri()}`)
  console.log(
    `[dev:fake] app at ${origin}, test sign-in at ${origin}/dev/sign-in`,
  )

  mkdirSync('.next', { recursive: true })
  const serverLog = createWriteStream('.next/dev-fake-server.log', {
    flags: 'w',
  })
  const next = spawn('next', ['dev', '--port', port], {
    stdio: ['ignore', 'pipe', 'pipe'],
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

  next.stdout.on('data', (chunk) => {
    serverLog.write(chunk)
    process.stdout.write(chunk)
  })
  next.stderr.on('data', (chunk) => {
    serverLog.write(chunk)
    process.stderr.write(chunk)
  })

  let stopping = false
  async function stop(code: number) {
    if (stopping) return
    stopping = true
    css.kill('SIGTERM')
    next.kill('SIGTERM')
    await mongo.stop()
    process.exit(code)
  }

  next.on('exit', (code) => void stop(code ?? 0))
  process.on('SIGINT', () => void stop(0))
  process.on('SIGTERM', () => void stop(0))
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)),
    )
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
