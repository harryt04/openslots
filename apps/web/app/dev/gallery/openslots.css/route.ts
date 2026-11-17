import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * The compiled `@openslots/react/styles.css`, alone, for the gallery's C1
 * frame: a pretend host page that must get the package's CSS and nothing
 * from this app. Development only.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new Response(null, { status: 404 })
  }
  const file = path.join(
    process.cwd(),
    '..',
    '..',
    'packages',
    'react',
    'dist',
    'styles.css',
  )
  const css = await readFile(file, 'utf8')
  return new Response(css, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
