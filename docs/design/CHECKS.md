# Slice 4C design check record

This is an incomplete verification record, not a release sign-off. “not met” includes checks not verified in this slice; it does not assert a confirmed product defect. Fake Google cannot prove live OAuth, invitations, refresh, or Google tombstone restoration.

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| S1-1 | not met | Pending final screen-by-screen verification: Google is the only sign-in method (Better Auth social provider). |
| S1-2 | not met | Pending final screen-by-screen verification: The same consent grants calendar access, with offline access so tokens refresh. |
| S1-3 | not met | Pending final screen-by-screen verification: First sign-in lands on a "name your business" step, then S5. |
| S2-1 | not met | Pending final screen-by-screen verification: Grouped by day in the business timezone; each row shows time range, customer, service with its color and name, status. |
| S2-2 | not met | Pending final screen-by-screen verification: Clicking a row opens a dialog with details and Cancel / Reschedule; both update the Google event. |
| S2-3 | not met | Pending final screen-by-screen verification: Empty state points to "Copy booking link" and S7. |
| S3-1 | not met | Pending final screen-by-screen verification: Duration is the largest thing on each card. The switch pauses a service without deleting it. |
| S3-2 | not met | Pending final screen-by-screen verification: A second business (for example consulting: Intro call 15, Strategy session 90) has a completely separate list. |
| S4-1 | not met | Pending final screen-by-screen verification: Duration presets 15 to 180 plus custom (multiples of 5, up to 8 hours). |
| S4-2 | not met | Pending final screen-by-screen verification: "Start times every" is independent of duration, so a 180 min service can start hourly. |
| S4-3 | not met | Pending final screen-by-screen verification: The preview is computed by the same slot engine the API uses, not a separate approximation. |
| S4-4 | not met | Pending final screen-by-screen verification: Saving validates with zod and shows inline field errors (shadcn Form). |
| S5-1 | not met | Pending final screen-by-screen verification: Each weekday has an on/off switch and one or more time ranges (a lunch gap is two ranges). |
| S5-2 | not met | Pending final screen-by-screen verification: Overrides can close a day, shorten it, or open a normally closed day. |
| S5-3 | not met | Pending final screen-by-screen verification: Hours are stored in the schedule's timezone; daylight saving changes are handled by the slot engine with tests. |
| S5-4 | not met | Pending final screen-by-screen verification: Several schedules per business; each service chooses one. |
| S6-1 | not met | Pending final screen-by-screen verification: Any number of Google accounts per business; each calendar has its own "blocks slots" switch. |
| S6-2 | not met | Pending final screen-by-screen verification: Exactly one calendar per business receives new bookings. |
| S6-3 | not met | Pending final screen-by-screen verification: A broken connection is loud here and in the sidebar, and booking fails closed (no slots offered) rather than risking a double booking. |
| S6-4 | not met | Pending final screen-by-screen verification: Only free/busy times are read; event titles are never fetched or stored. |
| S7-1 | not met | Pending final screen-by-screen verification: One publishable key per business, rotatable. Allowed sites enforce CORS on the public API. |
| S7-2 | not met | Pending final screen-by-screen verification: The snippet shows this install's real host and key, ready to paste. |
| S8-1 | not met | Pending final screen-by-screen verification: Four steps: service, day and time, details, confirmation. Progress bar shows position. |
| S8-2 | not met | Pending final screen-by-screen verification: Days with no openings are disabled and struck through; available days are tinted. |
| S8-3 | not met | Pending final screen-by-screen verification: Times display in the customer's timezone (detected, changeable); the business timezone is shown beside it when different. |
| S8-4 | not met | Pending final screen-by-screen verification: If the slot was taken while the form was open, the customer returns to the time step with a plain message. No double booking. |
| S8-5 | not met | Pending final screen-by-screen verification: On success a Google Calendar event exists with the customer as a guest, and the confirmation shows manage links. |
| S8-6 | not met | Pending final screen-by-screen verification: Fully keyboard operable; day grid uses arrow keys (shadcn Calendar). |
| S9-1 | not met | Pending final screen-by-screen verification: Layout responds to the component's own width (container query), not the window, so it also works inside a narrow column on a desktop site. |
| S9-2 | not met | Pending final screen-by-screen verification: Stacked order: summary, calendar, times. Times become a wrapping grid. |
| S9-3 | not met | Pending final screen-by-screen verification: Tap targets are at least 38px tall. |
| S10-1 | not met | Pending final screen-by-screen verification: Reached by an unguessable token; no login. |
| S10-2 | not met | Pending final screen-by-screen verification: Reschedule reuses the day and time step; cancel asks for confirmation. Both update Google. |
| C-1 | not met | Pending final screen-by-screen verification: Ships its own compiled CSS; the host app does not need Tailwind or shadcn. |
| C-2 | not met | Pending final screen-by-screen verification: Themable through CSS variables with shadcn names, so a shadcn host app can make it match by passing its tokens. |
| C-3 | not met | Pending final screen-by-screen verification: React 18 and 19, ESM, typed, no dependency on Next.js. Works in a client component. |
| C-4 | not met | Pending final screen-by-screen verification: All styles scoped under one root class so nothing leaks into or out of the host page. |
| S1 T-1 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S1 T-2 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S1 T-3 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S1 T-4 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S1 T-5 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S1 T-6 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S2 T-1 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S2 T-2 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S2 T-3 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S2 T-4 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S2 T-5 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S2 T-6 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S3 T-1 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S3 T-2 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S3 T-3 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S3 T-4 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S3 T-5 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S3 T-6 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S4 T-1 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S4 T-2 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S4 T-3 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S4 T-4 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S4 T-5 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S4 T-6 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S5 T-1 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S5 T-2 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S5 T-3 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S5 T-4 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S5 T-5 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S5 T-6 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S6 T-1 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S6 T-2 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S6 T-3 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S6 T-4 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S6 T-5 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S6 T-6 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S7 T-1 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S7 T-2 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S7 T-3 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S7 T-4 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S7 T-5 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S7 T-6 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S8 T-1 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S8 T-2 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S8 T-3 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S8 T-4 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S8 T-5 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S8 T-6 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S9 T-1 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S9 T-2 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S9 T-3 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S9 T-4 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S9 T-5 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S9 T-6 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S10 T-1 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S10 T-2 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S10 T-3 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S10 T-4 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S10 T-5 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| S10 T-6 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| C1 T-1 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| C1 T-2 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| C1 T-3 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| C1 T-4 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| C1 T-5 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |
| C1 T-6 | not met | Full light/dark, desktop/phone verification pending; no measured per-screen sign-off. |

## Evidence captured

- S1-login-light.png and S1-login-dark.png in the ignored `.screenshots/` directory. Other screen/state screenshots remain outstanding.
- The spec was opened from its file path in agent-browser in light and dark. No complete side-by-side pass was performed.
- An exploratory computed-color script was rejected as evidence: it did not composite transparent backgrounds or account for gradients. No contrast ratio from that script is a valid AA result. Full contrast, vision-deficiency, focus and phone matrices remain outstanding.
- Existing Playwright tests cover many functional checks, but are not substitutes for the requested visual pass.

## Functional evidence (not a visual sign-off)

The initial local Playwright run passed 29/29 tests in 2.2 minutes, including keyboard booking, attendee/event inspection, management, cancellation focus restoration, availability editor, services and developer settings. That run preceded the final navigation-helper and concurrent-race changes; it is not a pass of the final tree.

Initial `pnpm run ci` attempts failed on TypeScript errors in the new PostHog test, corrected before a successful full CI run. A targeted handler rerun under heavy machine load timed out in randomized seed 4421 and crash-create cases 1–3; crash-create 4 then failed its drain assertion (one unfinished record). This run is inconclusive because timed-out tests can leave operations running into subsequent fixtures; isolated verification is required before treating the drain failure as a state-machine defect. No state-machine code was changed.

A subsequent eight-worker Playwright run was stopped after unrelated admin actions exceeded their existing deadlines under load (host load average approximately 60). The calendar failure was at its final unlink while status remained “Saving…”. The hosted failures waited for service creation to redirect. Two-worker verification follows; no timeout or retry was increased.

Final full local CI passed (248 web tests, core tests, React 19/18 suites, production build); the added reconciliation tests passed and the earlier drain failure did not recur. Expanded Playwright suite passed 32/32 in 2.3 minutes with two workers. Final repeated-run evidence is recorded in the PR.

Additional ignored artifacts: `S2-{empty,list,mobile,details,reschedule,cancel}-{light,dark}.png`, copied from the existing Bookings test captures. They do not use the exact specification fixture and are not a visual sign-off. Discarded exploratory theme captures are not evidence; the retained S1 light screenshot was inspected after recapture.
