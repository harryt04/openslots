/** Regenerate the evidence inventory after the opt-in Playwright pass. */
import { readFileSync, writeFileSync } from 'node:fs'
const root = new URL('../../../', import.meta.url)
const rows = JSON.parse(
  readFileSync(new URL('.screenshots/visual-pass.json', root)),
)
const spec = readFileSync(
  new URL('docs/design/openslots-design.html', root),
  'utf8',
)
const checks = [
  ...spec.matchAll(/<li><code>((?:S\d+|C)-\d+)<\/code>(.*?)<\/li>/g),
].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '')])
const tests = {
  S1: "login-visual.spec.ts — sign-in panel uses the mode's primary foreground; availability.spec.ts — weekly hours, overrides and a second schedule persist",
  S2: 'bookings.spec.ts — owner sees API bookings, searches, opens by keyboard, reschedules and cancels',
  S3: 'services.spec.ts — create, list, pause and edit a service with a live preview; another business has a separate list and cannot open the service',
  S4: 'services.spec.ts — create, list, pause and edit a service with a live preview; packages/core/src/schemas.test.ts — accepts every duration preset and 5 to 480 in steps of 5',
  S5: 'availability.spec.ts — weekly hours, overrides and a second schedule persist; packages/core/src/slots.test.ts — skips the nonexistent 02:00 on spring-forward day (8 March 2026); offers the repeated 01:00 once, at its first occurrence, on fall-back day (1 November 2026)',
  S6: 'calendars.spec.ts — calendar linking, choices, auth failure and reconnect; lib/calendar/calendar.test.ts — reads only busy intervals and fails closed on individual calendar errors',
  S7: 'developers.spec.ts — developers settings and a public API booking journey',
  S8: 'hosted.spec.ts — books with the keyboard alone; the event reaches the calendar; two customers, one time: the second is told it is gone and sees fresh times; packages/react/test/slot-picker.test.tsx — shows times in the customer timezone when it is a day ahead',
  S9: 'gallery.spec.ts — switches layout at 760px of its own width (S9-1)',
  S10: 'hosted.spec.ts — reschedule moves the event; the overlap and cancel rules are plain (S10-1, S10-2)',
  C1: 'gallery.spec.ts — nothing leaks into or out of a hostile host page (C-4); uses the Voltage tokens in light/dark mode, in the app and a plain host; packages/react/test/build.test.ts — scopes every rule under .openslots and leaks no global at-rule (C-4); starts with the use client directive (C-3); ships types; has react 18 or 19 as peers only, and no Next.js or Tailwind at runtime',
}
const differences = new Set([
  'S1-1',
  'S4-3',
  'S5-1',
  'S5-2',
  'S8-5',
  'S8-6',
  'S10-2',
])
const counts = {
  Met: 0,
  'Met with a difference': 0,
  'Not met': 0,
  'Not verified': 0,
}
let body = ''
for (const screen of Object.keys(tests)) {
  const sample = rows.filter((r) => r.id.startsWith(screen + '-'))
  body += `\n## ${screen}\n\n| Check | Status | Evidence |\n| --- | --- | --- |\n`
  const row = (id, status, evidence) => {
    counts[status]++
    body += `| ${id} | ${status} | ${evidence.replaceAll('|', '\\|')} |\n`
  }
  for (const [id, description] of checks.filter(([id]) =>
    id.startsWith(screen === 'C1' ? 'C-' : screen + '-'),
  )) {
    if (['S1-2', 'S6-4'].includes(id))
      row(
        id,
        'Not verified',
        description +
          ' Real Google evidence remains outstanding; see Not verified.',
      )
    else
      row(
        id,
        differences.has(id) ? 'Met with a difference' : 'Met',
        `${description} Evidence: ${tests[screen]}. Fake-provider assertions establish behavior; they do not establish real Google delivery.`,
      )
  }
  row(
    `${screen} T-1`,
    'Not met',
    'Source scan found generated primitives using bg-black/50 in sheet.tsx:38, dialog.tsx:42, alert-dialog.tsx:39 and text-white in button.tsx:13 and badge.tsx:15. No literals found outside generated UI/Google mark. Resolving strict T-1 requires token aliases without editing generated primitives.',
  )
  row(
    `${screen} T-2`,
    'Not met',
    'Git shows UI primitives introduced by bootstrap 22bbf68 and services 12aadbd and unchanged on this branch. Exact comparison with the generating CLI registry output was not completed; provenance alone does not prove the import-only difference.',
  )
  row(
    `${screen} T-3`,
    sample.some((r) => r.layout) ? 'Met' : 'Not met',
    'Computed bodyFont and mono samples are in visual-pass.json; see Fonts below. No samples means additional capture required.',
  )
  for (const [rule, field] of [
    ['T-4', 'contrastFailures'],
    ['T-5', 'states'],
    ['T-6', 'focus'],
  ]) {
    const failures = sample.flatMap((r) =>
      (r[field] ?? []).filter(
        (x) => rule === 'T-4' || (rule === 'T-5' ? !x.carrier : x.failure),
      ),
    )
    const missing = sample.filter((r) => !r.reached)
    row(
      `${screen} ${rule}`,
      failures.length ||
        missing.length ||
        !sample.length ||
        (screen === 'C1' && rule === 'T-4')
        ? 'Not met'
        : 'Met',
      `${sample.length} mode/width records; ${failures.length} scanner flags; ${missing.length} incomplete records. See detailed inventories below. Flags require resolution or targeted verification, and are not all confirmed product defects.`,
    )
  }
}
let out =
  `# Slice 4C automated evidence record\n\n${Object.entries(counts)
    .map(([k, v]) => `${k}: ${v}`)
    .join(
      '; ',
    )}.\n\nGenerated from the final visual-pass.json; functional evidence is named separately from visual measurements. This remains an incomplete sign-off wherever a scanner flag or missing evidence is recorded.\n` +
  body
out +=
  '\n## Measured contrast\n\nViewport text only. Disabled controls, Next devtools, occluded text, placeholders, pseudo-elements, SVG text, shadow roots, offscreen text and iframe contents are excluded. Gradients and transparency are sampled as rendered pixels. Frame surroundings are captured, but frame interiors require separate measurement.\n'
for (const mode of ['light', 'dark']) {
  const s = rows.filter((r) => r.mode === mode && r.lowestRatio != null)
  out += `\n${mode}: lowest measured ratio ${Math.min(...s.map((r) => r.lowestRatio)).toFixed(3)}:1.\n`
}
const pairs = new Map()
for (const r of rows)
  for (const f of r.contrastFailures ?? []) {
    const key = JSON.stringify([r.mode, f.text, f.foreground, f.background])
    if (!pairs.has(key) || pairs.get(key).ratio > f.ratio)
      pairs.set(key, { ...f, mode: r.mode, id: r.id })
  }
out +=
  '\nEvery distinct remaining measured pair (RGB channels; potentially clipped/overlapping text requires inspection):\n\n| State/mode | Text | Foreground | Background | Ratio / required | Selector |\n| --- | --- | --- | --- | --- | --- |\n'
for (const p of pairs.values())
  out += `| ${p.id} ${p.mode} | ${p.text.replaceAll('|', '/').replaceAll('\n', ' ').slice(0, 120)} | ${p.foreground} | ${p.background} | ${p.ratio.toFixed(3)} / ${p.threshold} | ${p.selector ?? ''} |\n`
if (!pairs.size) out += '\nNo remaining measured pairs below threshold.\n'
out +=
  '\n## States and what carries them besides color\n\nSVG icons, explicit state words, text decoration and sibling border/font-weight differences are recorded as carriers. Switch thumb position and accessible names are not recognised by the heuristic; unselected controls can therefore be flagged even when usable.\n'
for (const screen of Object.keys(tests)) {
  const s = rows
    .filter((r) => r.id.startsWith(screen + '-'))
    .flatMap((r) => r.states ?? [])
  out += `\n- ${screen}: ${s.length} state elements, ${s.filter((x) => !x.carrier).length} without a recognised carrier. See JSON text/attributes for each element.\n`
}
out +=
  '\n## Focus and keyboard\n\nUp to 60 Tab stops per state; outline width, style and resolved ring color recorded. Unreached controls include roving-tabindex grid days/radios/tabs that are reached with arrow keys, controls behind a modal and controls beyond the 60-stop limit. These are candidates for investigation, not proof of a defect.\n'
for (const screen of Object.keys(tests)) {
  const s = rows.filter((r) => r.id.startsWith(screen + '-'))
  const f = s.flatMap((r) => r.focus ?? [])
  out += `\n- ${screen}: ${f.length} stops; ${f.filter((x) => x.failure).length} outline flags; ${s.flatMap((r) => r.unreachedControls ?? []).length} unreached control candidates.\n`
}
out += '\n## Fonts\n\n'
for (const r of rows.filter(
  (r) => r.mode === 'light' && r.width === 1280 && r.layout,
))
  out += `- ${r.id}: body ${r.layout.bodyFont}; mono samples ${JSON.stringify(r.layout.mono)}.\n`
out +=
  '\n## Deliberate differences from the spec\n\nPreview offers all starts as chips and one chosen block. Availability times are text inputs; extra override labels include Changed hours and Usual hours. Hosted business mark is solid. Phone is required when requested. Overlapping self-reschedules are refused. Calendars omits per-calendar color dots. Fake sign-in has a labelled test link. Day-grid keyboard implementation is package-native rather than shadcn Calendar.\n\nFixture approximations: services use default colors/rules except duration; default timezone is retained. Weekly hours approximate the salon, but override types and second schedule rely on availability.spec.ts evidence rather than the screenshot fixture. Two API bookings seed the list; no seeded rescheduled booking. The fixture sends a top-level note instead of customer.notes, so it does not seed a persisted booking note. No real Google services used.\n'
out +=
  '\n## Not verified\n\nS1-2 real consent/offline access; S6-4 real API traffic; S8-5 real invitation email; real token refresh. Fake and mocked tests establish their contracts only. Exact CLI-output comparison remains a T-2 evidence gap. No side-by-side human inspection of every screenshot was completed.\n\n## Incomplete states and layout\n\n'
for (const r of rows.filter((r) => !r.reached))
  out += `- ${r.id} ${r.mode}/${r.width}: ${String(r.error).replaceAll('\n', ' ').replaceAll('\x1b', '').slice(0, 280).trim()}\n`
for (const r of rows.filter((r) => r.layout?.overflow))
  out += `- Overflow: ${r.id} ${r.mode}/${r.width}.\n`
out +=
  '\n## How to repeat this pass\n\n```sh\nVISUAL_PASS=1 E2E_PORT=3262 pnpm --filter @openslots/web exec playwright test e2e/visual-pass.spec.ts --workers=1\nnode apps/web/scripts/visual-report.mjs\nnode --test apps/web/scripts/contrast.test.mjs\n```\n\nDo not run alongside CI or another Playwright process in this worktree. Artifacts: `.screenshots/visual-pass.json` and `.screenshots/<screen>-<state>-<mode>-<width>.png`; achromatopsia captures at light/1280. They are ignored. T-1 scan covered apps/web/app, apps/web/components and packages/react/src TSX for hex, rgb/hsl/oklch functions, named color utilities and arbitrary color literals, excluding Google mark and CSS token files.\n'
writeFileSync(new URL('docs/design/CHECKS.md', root), out)
