'use client'

import { useTheme } from 'next-themes'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/*
 * A pretend host page for C1: its own serif type and deliberately hostile
 * global styles, and none of this app's CSS. Only the package's compiled
 * stylesheet is loaded. If anything leaked in, the booking UI would break;
 * if anything leaked out, the host's own heading and buttons would change.
 * Colors are CSS system colors, so the host has a palette without a single
 * color value of its own.
 */
const HOST_DOCUMENT = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/dev/gallery/openslots.css">
<style>
  html { font-size: 10px; color-scheme: light; }
  html.dark { color-scheme: dark; }
  body { margin: 0; padding: 24px; font: 18px/2 Georgia, 'Times New Roman', serif; background: Canvas; color: CanvasText; }
  * { box-sizing: content-box; }
  div { display: flex; flex-wrap: wrap; }
  p, h1, h2, h3 { margin: 1.5em 0; letter-spacing: 0.1em; }
  h2, h3 { text-transform: uppercase; font-size: 2em; }
  ul { padding-left: 4em; list-style: square; }
  button { all: unset; }
  .btn { padding: 12px 28px; border: 3px dashed; text-transform: uppercase; font-weight: bold; }
  input, select, textarea { border: 4px inset; padding: 12px; font-size: 24px; }
  a { color: LinkText; text-decoration: underline wavy; }
  svg { width: 48px; height: 48px; }
  .host-shell { display: block; max-width: 560px; margin: 0 auto; }
</style>
</head>
<body>
  <div class="host-shell">
    <h1 id="host-title" style="font-size: 26px; margin: 0 0 12px; letter-spacing: normal; text-transform: none;">Book your visit</h1>
    <div id="mount" style="display: block"></div>
    <p id="host-note">The host's own text, buttons and links keep the host's styles:</p>
    <button id="host-button" class="btn">Host .btn</button>
    <a id="host-link" href="#">host link</a>
  </div>
</body>
</html>`

export function HostFrame({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [height, setHeight] = useState(600)
  const { resolvedTheme } = useTheme()

  // The iframe can finish loading before React attaches `onLoad`.
  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    const attach = () => {
      const el = frame.contentDocument?.getElementById('mount')
      if (el) setMount(el)
    }
    if (frame.contentDocument?.readyState === 'complete') attach()
    frame.addEventListener('load', attach)
    return () => frame.removeEventListener('load', attach)
  }, [])

  useEffect(() => {
    const doc = mount?.ownerDocument
    doc?.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }, [mount, resolvedTheme])

  useEffect(() => {
    const body = mount?.ownerDocument.body
    if (!body) return
    const observer = new ResizeObserver(() =>
      setHeight(Math.ceil(body.scrollHeight) + 4),
    )
    observer.observe(body)
    return () => observer.disconnect()
  }, [mount])

  return (
    <>
      <iframe
        ref={ref}
        title={title}
        srcDoc={HOST_DOCUMENT}
        className="w-full rounded-b-xl border-0"
        style={{ height }}
      />
      {mount ? createPortal(children, mount) : null}
    </>
  )
}
