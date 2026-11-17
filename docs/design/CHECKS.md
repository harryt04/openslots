# Slice 4C visual check record

This is a **partial pass**, not release sign-off. This branch verifies S1 only.
Every other numbered check remains Not met because this pass has no visual evidence
for it. This does not assert a confirmed product defect. The previous branch's
functional test results are not evidence of a visual pass of this tree.

Base: `367864f8624a0f4687b5339386e76b8aaf3f961c`. Worktree:
`/home/harry/.treehouse/openslots-7e4791/9/openslots`.
Fake app: port 3261. Screenshots are ignored and were not committed.

The spec was opened directly from its file path with agent-browser, Voltage selected.
S1 captures cover 1280 × 900 and 390 × 900, light and dark, ordinary sign-in and
`?error=access_denied`. The corresponding images were inspected; this is not a
pixel-diff or a completed side-by-side pass of every mockup.

## S1

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| S1-1 | Met with a difference | S1-login-{light,dark}.png: Google is the sole production action. Fake mode adds a labelled test-sign-in link. Source: app/login/page.tsx and google-sign-in.tsx. |
| S1-2 | Not met | Real consent/offline refresh was not exercised. Requires a real Google account and inspection of consent plus refresh behavior. |
| S1-3 | Not met | Onboarding was not walked in this visual pass. Requires first-sign-in capture and verification of redirect to S5. |
| S1 T-1 | Met | Source scan of app/login and components found no literal colors except the isolated Google mark. Gradient uses primary/accent; the fix aliases an existing foreground token. |
| S1 T-2 | Met | Google action and fake-only link use components/ui/button.tsx. This branch does not modify components/ui. |
| S1 T-3 | Met | Computed focused-control font: GeistSans; screenshot text uses the inherited UI font. No times, durations, keys or code on S1. |
| S1 T-4 | Met with a difference | Measured rendered-pixel text contrast in eight mode/width/state combinations; minimum light 5.34:1, dark 5.46:1. Dark gradient now uses primary-foreground. See Measured contrast and script exclusions. |
| S1 T-5 | Not met | Sign-in actions have text labels and button shape; error has AlertCircle plus message. Dark ordinary sign-in remains distinguishable in all three CDP vision emulations (S1-login-{deuteranopia,protanopia,achromatopsia}.png). Error-state vision emulation and busy state remain unverified. |
| S1 T-6 | Not met | Tab reaches Google action then test-sign-in link, both 2px solid ring; login-visual.spec.ts asserts outline width/style. Ring against adjacent body: light 6.21:1, dark 5.45:1. Next devtools control is outside product scope. Enter into real OAuth and busy-state focus not verified. |

## S2

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| S2-1 | Not met | Not visually verified here; must verify: Grouped by day in the business timezone; each row shows time range, customer, service with its color and name, status. |
| S2-2 | Not met | Not visually verified here; must verify: Clicking a row opens a dialog with details and Cancel / Reschedule; both update the Google event. |
| S2-3 | Not met | Not visually verified here; must verify: Empty state points to "Copy booking link" and S7. |
| S2 T-1 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S2 T-2 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S2 T-3 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S2 T-4 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S2 T-5 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S2 T-6 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |

## S3

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| S3-1 | Not met | Not visually verified here; must verify: Duration is the largest thing on each card. The switch pauses a service without deleting it. |
| S3-2 | Not met | Not visually verified here; must verify: A second business (for example consulting: Intro call 15, Strategy session 90) has a completely separate list. |
| S3 T-1 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S3 T-2 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S3 T-3 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S3 T-4 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S3 T-5 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S3 T-6 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |

## S4

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| S4-1 | Not met | Not visually verified here; must verify: Duration presets 15 to 180 plus custom (multiples of 5, up to 8 hours). |
| S4-2 | Not met | Not visually verified here; must verify: "Start times every" is independent of duration, so a 180 min service can start hourly. |
| S4-3 | Not met | Not visually verified here; must verify: The preview is computed by the same slot engine the API uses, not a separate approximation. |
| S4-4 | Not met | Not visually verified here; must verify: Saving validates with zod and shows inline field errors (shadcn Form). |
| S4 T-1 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S4 T-2 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S4 T-3 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S4 T-4 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S4 T-5 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S4 T-6 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |

## S5

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| S5-1 | Not met | Not visually verified here; must verify: Each weekday has an on/off switch and one or more time ranges (a lunch gap is two ranges). |
| S5-2 | Not met | Not visually verified here; must verify: Overrides can close a day, shorten it, or open a normally closed day. |
| S5-3 | Not met | Not visually verified here; must verify: Hours are stored in the schedule's timezone; daylight saving changes are handled by the slot engine with tests. |
| S5-4 | Not met | Not visually verified here; must verify: Several schedules per business; each service chooses one. |
| S5 T-1 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S5 T-2 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S5 T-3 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S5 T-4 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S5 T-5 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S5 T-6 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |

## S6

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| S6-1 | Not met | Not visually verified here; must verify: Any number of Google accounts per business; each calendar has its own "blocks slots" switch. |
| S6-2 | Not met | Not visually verified here; must verify: Exactly one calendar per business receives new bookings. |
| S6-3 | Not met | Not visually verified here; must verify: A broken connection is loud here and in the sidebar, and booking fails closed (no slots offered) rather than risking a double booking. |
| S6-4 | Not met | Not visually verified here; must verify: Only free/busy times are read; event titles are never fetched or stored. |
| S6 T-1 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S6 T-2 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S6 T-3 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S6 T-4 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S6 T-5 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S6 T-6 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |

## S7

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| S7-1 | Not met | Not visually verified here; must verify: One publishable key per business, rotatable. Allowed sites enforce CORS on the public API. |
| S7-2 | Not met | Not visually verified here; must verify: The snippet shows this install's real host and key, ready to paste. |
| S7 T-1 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S7 T-2 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S7 T-3 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S7 T-4 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S7 T-5 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S7 T-6 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |

## S8

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| S8-1 | Not met | Not visually verified here; must verify: Four steps: service, day and time, details, confirmation. Progress bar shows position. |
| S8-2 | Not met | Not visually verified here; must verify: Days with no openings are disabled and struck through; available days are tinted. |
| S8-3 | Not met | Not visually verified here; must verify: Times display in the customer's timezone (detected, changeable); the business timezone is shown beside it when different. |
| S8-4 | Not met | Not visually verified here; must verify: If the slot was taken while the form was open, the customer returns to the time step with a plain message. No double booking. |
| S8-5 | Not met | Not visually verified here; must verify: On success a Google Calendar event exists with the customer as a guest, and the confirmation shows manage links. |
| S8-6 | Not met | Not visually verified here; must verify: Fully keyboard operable; day grid uses arrow keys (shadcn Calendar). |
| S8 T-1 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S8 T-2 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S8 T-3 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S8 T-4 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S8 T-5 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S8 T-6 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |

## S9

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| S9-1 | Not met | Not visually verified here; must verify: Layout responds to the component's own width (container query), not the window, so it also works inside a narrow column on a desktop site. |
| S9-2 | Not met | Not visually verified here; must verify: Stacked order: summary, calendar, times. Times become a wrapping grid. |
| S9-3 | Not met | Not visually verified here; must verify: Tap targets are at least 38px tall. |
| S9 T-1 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S9 T-2 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S9 T-3 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S9 T-4 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S9 T-5 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S9 T-6 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |

## S10

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| S10-1 | Not met | Not visually verified here; must verify: Reached by an unguessable token; no login. |
| S10-2 | Not met | Not visually verified here; must verify: Reschedule reuses the day and time step; cancel asks for confirmation. Both update Google. |
| S10 T-1 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S10 T-2 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S10 T-3 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S10 T-4 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S10 T-5 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| S10 T-6 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |

## C1

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| C-1 | Not met | Not visually verified here; must verify: Ships its own compiled CSS; the host app does not need Tailwind or shadcn. |
| C-2 | Not met | Not visually verified here; must verify: Themable through CSS variables with shadcn names, so a shadcn host app can make it match by passing its tokens. |
| C-3 | Not met | Not visually verified here; must verify: React 18 and 19, ESM, typed, no dependency on Next.js. Works in a client component. |
| C-4 | Not met | Not visually verified here; must verify: All styles scoped under one root class so nothing leaks into or out of the host page. |
| C1 T-1 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| C1 T-2 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| C1 T-3 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| C1 T-4 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| C1 T-5 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |
| C1 T-6 | Not met | No evidence from this pass. Requires both modes, 1280px and 390px, every requested state, and the rule-specific measurement or interaction. |

## Measured contrast

Reproduce a viewport measurement from the worktree root:

```sh
node apps/web/scripts/contrast.mjs http://localhost:3261/login dark /tmp/S1-dark
node --test apps/web/scripts/contrast.test.mjs
```

The script replaces text with invisible metric-preserving spans for a background
screenshot, then paints solid ink in those same spans for a foreground screenshot.
Chromium composites foreground alpha, ancestor opacity and background layers;
all interior pixels of each text rectangle are compared, taking the worst ratio.
Thus gradients are sampled rather than treated as a single computed background.
Solid ink avoids measuring glyph antialiasing. Tests cover nested group opacity,
translucent ink over a gradient, cleanup and the 3:1/4.5:1 size/weight thresholds.

Limitations: viewport text nodes only; placeholders, pseudo-elements, SVG text,
shadow roots and iframe contents are excluded. Occluded or clipped text can produce
false failures and needs manual inspection. Layout-sensitive inline wrapping needs
inspection. This is not a universal accessibility scanner. Next devtools are hidden
during measurement. Caller must navigate to each state, scroll and measure frames
separately; the CLI measures one page at 1280 × 900.

S1 output is retained locally in `.screenshots/S1-measurements.json`, including
text, foreground/background RGB, size, weight, threshold and worst ratio for every
measured text node. Ordinary/error states were measured at both widths in both modes.
No below-threshold pairs remain **in those measured S1 states**.
Lowest light ratio: 5.34:1; lowest dark ratio: 5.46:1.
Dark muted text: 8.22:1, RGB (169,164,200) on (12,10,26).

Confirmed pre-fix failure: S1 dark logo “OpenSlots”, 16px/700, white (255,255,255)
on gradient pixel (146,115,245): **3.50:1**, required 4.5:1. Fixed by aliasing
`--brand-panel-foreground` to `--primary-foreground` in dark mode. Post-fix logo:
(12,10,26) on (143,113,246), **5.46:1**. The maintainer must accept dark ink in the
dark-mode panel or choose another accessible existing-token combination; retaining
white small text on that gradient would fail AA.

Service blue, tangerine/highlight surfaces, struck-through/disabled text,
placeholders and optional booking hints were **not measured**. There is no claim
that no failures remain elsewhere.

## Color independence and keyboard

S1: sign-in actions have labels and button shape; error uses an icon and message.
No selected, paused, availability, chosen slot, blocking or required-field states
exist on the ordinary sign-in screen. Busy text is labelled “Connecting…” in source,
but was not captured. Three CDP emulation screenshots of dark ordinary sign-in were
inspected: labels and action outlines remain distinguishable. Error-state and
light-mode emulation remain to do. Other screens' state inventories remain to do.

Both product focus stops were tabbed at both widths and modes; computed outline
is 2px solid RGB (91,52,245) in light and (139,112,255) in dark. No dialogs or grids
exist on this screen. Other screens' keyboard operation, traps, restoration,
arrow grids and ring contrast remain unverified.

## Fonts, tokens and primitives

A source search for hex, rgb/hsl/oklch literals and arbitrary literal color utilities
in TS/TSX under apps/web/app, apps/web/components and packages/react/src (excluding
GoogleMark) returned no matches. Named colors and all arbitrary utility variations
were not exhaustively audited. Only S1's font and primitive usage were inspected.
No components/ui file was modified. No claim about historical CLI provenance is made.

## Deliberate differences from the spec

- S1 dark gradient foreground uses dark primary ink to meet AA; marks differ.
- Fake sign-in link and Next development indicator are development-only.
- Service preview lists every start as chips and one chosen block, since offered starts overlap.
- Availability uses typed times; overrides also label Changed hours and Usual hours.
- Hosted business mark is solid; sign-in and business marks differ.
- Phone is required when a service requests it.
- Rescheduling overlapping the booking's own interval is refused.
- Per-calendar color dot is absent.

The last six entries are documented intended differences supplied for this task;
they have not been visually verified by this branch.

## Not verified

- S1-2 real consent and offline access; S6-4 real free/busy API behavior; S8-5 real invitation delivery. Fake providers cannot prove these.
- S1-3 onboarding; shell business switcher, onboarding and settings.
- Every numbered check of S2 through S10 and C1, and T-1 through T-6 for those screens, remains Not met for lack of evidence in this pass.
- Exact salon fixture and reusable setup script were not built. Existing e2e/support/salon.ts is only a partial starting point, not the requested fixture.
- All S2–S10/C1 state/width/theme screenshots, contrast measurements, per-screen color-state inventories, emulations and keyboard checks remain outstanding.
- S1 busy state, light-mode/error-state vision emulation, allowlist error, and real OAuth keyboard activation remain outstanding.
- Package iframe/placeholder contrast support must be added or separately measured before using this script for full sign-off.

## Local validation

Validation results are recorded below after execution. Screenshots remain local under
`/home/harry/.treehouse/openslots-7e4791/9/openslots/.screenshots/`.

- `pnpm install`: passed; requested base HEAD verified before installation.
- `pnpm run format:check`: passed.
- `pnpm run ci`: passed (lint, typecheck, unit suites, production build) with placeholder Mongo URL, Better Auth secret and URL. Web: 248 tests; core: 58; React 19: 70; React 18: 55.
- `node --test apps/web/scripts/contrast.test.mjs`: 2/2 passed.
- Targeted ESLint on the measurement script, its tests and login visual spec: passed.
- `E2E_PORT=3262 pnpm run e2e`: 34/34 passed in 2.3 minutes, including both new login foreground/focus regressions.
- Initial e2e launch failed because the visual server on 3261 held the worktree's Next development lock. Stopped visual server by PID 481915; rerun passed. CI and e2e were sequential.
- agent-browser session closed; visual server PIDs confirmed absent. No PR opened.
