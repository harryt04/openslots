import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
async function main() {
  const bundle = await build({
    entryPoints: ['e2e/embed/main.tsx'],
    bundle: true,
    write: false,
    format: 'esm',
    jsx: 'automatic',
  })
  const css = await readFile('../../packages/react/dist/styles.css')
  const html = `<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><style>button { all: unset } #host { font-size: 23px; padding: 7px; border: 3px solid; }</style></head><body><button id="host">Host control</button><div id="root"></div><script type="module" src="/main.js"></script></body></html>`
  createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname
    response.setHeader(
      'Content-Type',
      path === '/main.js'
        ? 'text/javascript'
        : path === '/styles.css'
          ? 'text/css'
          : 'text/html',
    )
    response.end(
      path === '/main.js'
        ? bundle.outputFiles[0]!.contents
        : path === '/styles.css'
          ? css
          : html,
    )
  }).listen(Number(process.env.E2E_EMBED_PORT ?? 3253), 'localhost')
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
