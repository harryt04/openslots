# OpenSlots: technical requirements

Status: approved for v1 build, 2026-11-16. Read with the [PRD](PRD.md) and the [design spec](design/openslots-design.html). Requirement IDs (`R1`…) refer to the PRD; screen IDs (`S1`…) to the design spec.

Items marked **Verify** are believed correct but must be confirmed against current library documentation by the slice that implements them. If one is wrong, fix this document in the same pull request.

## 1. Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js 26, pnpm 11 (pinned in `package.json`), committed `pnpm-lock.yaml` |
| App | Next.js 16 App Router, React, TypeScript strict. `proxy.ts`, not `middleware.ts` |
| UI | shadcn/ui (new-york), Tailwind CSS v4, Geist and Geist Mono (the self-hosted `geist` package, no font CDN), lucide-react, next-themes. React 19 in the app |
| Forms and validation | react-hook-form, zod |
| Auth | Better Auth, Google social provider only, MongoDB adapter |
| Database | MongoDB, native driver. Must work on a standalone server: **no multi-document transactions** |
| Analytics | PostHog, disabled unless a key is configured |
| Dates | `@date-fns/tz` (`tzOffset`, which reads the runtime's `Intl` data) in `@openslots/core`; calendar dates are `YYYY-MM-DD` strings. Not `Temporal`: Node 26 has it, but `@openslots/core` also runs in customers' browsers, where it is not yet universal. All stored instants are UTC `Date` |
| Tests | Vitest (unit, integration), Playwright (end to end) |
| Package build | `tsup` for `@openslots/react` and `@openslots/core` |

The starting point is the maintainer's scaffold at `github.com/harryt04/personal-project-scaffolding`. It is a Tailwind v3 template whose own instructions say new apps should start on Tailwind v4 with the new-york style; do that here.

## 2. Repository layout

```
apps/web/                 Next.js app: admin, hosted booking pages, public API
  app/(dashboard)/        signed-in routes (S2–S7); layout guards the session
  app/login/              S1
  app/b/[business]/       S8 hosted booking page, /b/[business]/[service]
  app/m/[token]/          S10 manage a booking
  app/api/auth/[...all]/  Better Auth handler
  app/api/v1/             public API
  lib/                    auth, mongo client, google client, repositories
packages/core/            @openslots/core: slot engine, zod schemas, shared types. No I/O
packages/react/           @openslots/react: BookingFlow, SlotPicker, ServiceList, hooks, client
docs/                     PRD, TRD, design spec, self-host guide
```

`pnpm-workspace.yaml` lists `apps/*` and `packages/*`. Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `e2e`, `ci` (lint, typecheck, test, build). Also `dev:fake` (the app with an in-memory MongoDB and fakes, used by Playwright), `create-indexes`, `prettify` and `format:check`.

The app consumes the workspace packages as TypeScript source (`transpilePackages`); each package's `publishConfig` points npm at its tsup `dist`. Development-only routes live under `app/dev/` and return 404 in production.

## 3. Data model

Collections belong to the app database. Every document except Better Auth's has `createdAt` and `updatedAt`. IDs are `ObjectId` unless stated.

| Collection | Fields | Indexes |
| --- | --- | --- |
| `user`, `session`, `account`, `verification` | Managed by Better Auth. `account` holds Google tokens | Better Auth defaults |
| `businesses` | `ownerUserId`, `name`, `slug`, `timezone` (IANA), `bookingCalendar` `{accountId, calendarId}`, `publishableKey`, `allowedOrigins[]` | unique `slug`; unique `publishableKey`; `ownerUserId` |
| `services` | `businessId`, `name`, `slug`, `description`, `color` (token name), `durationMin`, `bufferBeforeMin`, `bufferAfterMin`, `startIntervalMin`, `minNoticeMin`, `windowDays`, `maxPerDay?`, `scheduleId`, `askPhone`, `askNotes`, `active` | unique `{businessId, slug}` |
| `schedules` | `businessId`, `name`, `timezone`, `weekly` (7 entries, each a list of `{startMin, endMin}`), `overrides[]` `{date: 'YYYY-MM-DD', ranges[]}` (empty ranges means closed) | `businessId` |
| `calendar_links` | `businessId`, `accountId` (Better Auth account), `email`, `calendars[]` `{calendarId, name, blocks, writable}`, `status` (`ok` or `needs_reconnect`), `lastCheckedAt`, `needsReconnectSince?` (first auth failure, cleared on successful refresh) | unique `{businessId, accountId}` |
| `calendar_link_returns` | `nonce`, `userId`, `businessId`, `accountId?` (reconnect intent; absent for link), `snapshot[]` (owned account ids), `expiresAt`, timestamps; consumed once by the authenticated return handler | unique `nonce`; TTL `expiresAt` (0 seconds) |
| `bookings` | `businessId`, `serviceId`, service snapshot (`name`, `durationMin`, buffers), `start`, `end`, `status` (`pending`, `confirmed`, `cancelled`), `customer` `{name, email, phone?, notes?, timezone}`, `googleEventId?`, `manageTokenHash`, `rescheduledFrom?`, `origin?` | `{businessId, start}`; unique `manageTokenHash`; `{businessId, status, start}` |
| `slot_locks` | `businessId`, `block` (integer: UTC epoch minutes ÷ 5), `bookingId` | **unique `{businessId, block}`**; `bookingId` |

`schedules.weekly[0]` is Sunday (as `Date.getDay()`); a new business gets one schedule, Monday to Friday 09:00 to 17:00 in its timezone. Publishable keys are `os_pk_` plus 24 random bytes, base64url. Business slugs are global, 3 to 40 characters of `a-z0-9-`, and a reserved list of app routes is refused. Service slugs are unique only within their business, may be shorter, and have no reserved list. Admin code reaches businesses only through `requireBusiness()` in `apps/web/lib/businesses/current.ts`, which re-validates the remembered business (cookie `openslots_business`) against `ownerUserId` on every call. Creating a business and switching to one use the session and the owner-scoped repository directly. Schedules are reached only through `apps/web/lib/schedules/repository.ts`, which takes the business id from `requireBusiness()`, validates with `scheduleSchema` from `@openslots/core`, refuses to delete a business's last schedule, and refuses to delete one that a service (`services.scheduleId`, ObjectId or hex string) uses. Without transactions the last-schedule rule is re-checked after the delete and the document is put back if none remain. The in-use check and the delete are separate operations, so a service created at that instant can be left pointing at a missing schedule; anything that loads a service's schedule must treat a missing one as no availability and must never fall back to another schedule. Saving a schedule replaces it whole with no revision check: with two stale tabs the last save wins. Date overrides are labelled Closed, Extra day (the weekday is normally closed), Short day (less time, within the usual opening and closing), Usual hours (exactly the usual times) or Changed hours (anything else). Creating a business writes two documents without a transaction: if the schedule write fails, the business is deleted again. A service's slug is derived from its name when it is created (`cut-and-style`, then `cut-and-style-2`, …), unique per business through the `{businessId, slug}` index (a duplicate-key error moves to the next candidate), and kept when the service is renamed so shared links keep working. Admin service queries live in `apps/web/lib/services/repository.ts` and all take the business id from `requireBusiness()`.

Index creation lives in a script (`pnpm run create-indexes`, definitions in `apps/web/lib/mongo-utils.ts`), as in the scaffold; `pnpm run dev:fake` runs it on its fresh database. The app must not start serving bookings if the `slot_locks` unique index is missing.

## 4. Slot engine (`packages/core`)

A pure function with no I/O and no reading of the clock:

```ts
computeSlots(input: {
  service: ServiceRules
  schedule: Schedule            // weekly hours + overrides, with its timezone
  busy: Interval[]              // UTC; Google busy times and existing bookings incl. their buffers
  bookedCountByDate: Record<string, number>   // for maxPerDay, keyed by schedule-local date
  range: { from: string; to: string }         // schedule-local dates, inclusive
  now: Date
}): Record<string /* schedule-local date */, string[] /* UTC ISO start instants */>
```

Rules, in order:

1. For each local date in range, take override ranges if an override exists for that date, otherwise the weekday's ranges (`weekly[0]` is Sunday, `weekly[6]` Saturday).
2. Convert each range to UTC instants using the schedule timezone on that date. A range that crosses a daylight saving change uses wall-clock times; a start time that does not exist on that date is skipped. A wall time that occurs twice (fall-back) means its first occurrence. A range end that does not exist moves forward past the gap. `endMin` may be 1440, midnight at the end of the date.
3. Candidate starts step through the range every `startIntervalMin` of wall-clock time, beginning at the range start.
4. Keep a candidate only if `start + durationMin` (real elapsed time) is within the range. Buffers may extend outside working hours.
5. Drop it if `[start − bufferBefore, start + duration + bufferAfter)` overlaps any busy interval. All intervals are half-open, so touching is not overlapping.
6. Drop it if `start < now + minNoticeMin` or its local date is after (the schedule-local date of `now`) + `windowDays`.
7. Drop all candidates on a date that already has `maxPerDay` bookings.

The result has a key for every date in `range`, with an empty list when nothing is open, and starts in ascending order. Schedule times, durations, buffers and intervals are all multiples of 5 minutes (enforced by the zod schemas), so every start lands on a lock block.

`@openslots/core` also exports the helpers the other slices need: `groupSlotsByDate(slots, tz, range?)` regroups a result by date in the customer's timezone, dropping empty dates (the API asks the engine for the dates from `scheduleRangeFor`, two schedule-local days either side of the customer's range because zones can be more than 24 hours apart, and trims with `range`); `lockBlocks` lists a booking's `slot_locks` blocks (section 5); `occupiedInterval` turns an existing booking into a busy interval including its buffers.

Required tests: spring-forward and fall-back days in `America/Denver` and `Europe/London`; a customer timezone a day ahead of the business; multiple ranges in a day; overrides that close, shorten and open a day; buffers; a 180 minute service starting hourly; minimum notice, booking window and daily cap; the exact scenario drawn in screen S4. In that scenario (Wednesday 2 December 2026, open 9:00 to 18:00, busy 13:00 to 14:00, 180 minutes plus 15 after, hourly) the engine returns 09:00, 14:00 and 15:00; the drawing shows only 9:00 and 2:00 because overlapping blocks cannot both be drawn. The admin preview (S4-3) and the API both call this function.

## 5. Booking write path (R7, R8)

MongoDB runs without transactions, so correctness rests on the unique index on `slot_locks`.

1. Validate the request with zod. Load business, service, schedule.
2. Fetch fresh Google free/busy for the day (no cache) and existing bookings; run `computeSlots`; reject with `409 slot_taken` if the requested start is not in the result.
3. Insert the booking with `status: 'pending'`.
4. Insert one `slot_locks` document for every 5 minute block in `[start − bufferBefore, start + duration + bufferAfter)` with `insertMany(..., { ordered: false })`.
5. On any duplicate-key error: delete this booking's locks and the booking; respond `409 slot_taken`.
6. Create the Google Calendar event on the business's booking calendar with the customer as attendee and `sendUpdates: 'all'`.
7. On Google failure: delete locks and booking; respond `502 calendar_unavailable`. If the failure is an auth failure, set the link's status to `needs_reconnect`.
8. Set `status: 'confirmed'` and store `googleEventId`. Respond `201`.

Cancel: delete the Google event, delete the booking's locks, set `cancelled`. Reschedule: run steps 2 to 5 for the new time under the same booking ID with new locks, patch the Google event, then remove the old locks. Pending bookings older than two minutes are abandoned attempts: a sweep on each write path removes them and their locks.

Because all service durations and intervals are multiples of 5 minutes, block alignment is exact. A required test fires at least 20 concurrent requests for overlapping times and asserts exactly one `201`.

## 6. Google integration

- **Sign-in and consent.** Better Auth Google provider uses `accessType: 'offline'`, `prompt: 'consent'` and `scope`. Confirmed against [Better Auth Google documentation](https://www.better-auth.com/docs/authentication/google).
- **Scopes.** `calendar.freebusy`, `calendar.calendarlist.readonly`, `calendar.events`. Event details are never read (S6-4). Google's [scope reference](https://developers.google.com/workspace/calendar/api/auth) limits `calendar.events.owned` to owned calendars; OpenSlots permits writable shared booking calendars, so the broader events scope is required.
- **Tokens.** Better Auth stores encrypted access/refresh tokens with `account.encryptOAuthTokens: true` (using `BETTER_AUTH_SECRET`). Server callers use `auth.api.getAccessToken({ body: { accountId, userId } })`, where accountId is the Better Auth record id. It refreshes expired tokens and persists replacements. See [OAuth](https://www.better-auth.com/docs/concepts/oauth) and [options](https://www.better-auth.com/docs/reference/options). HTTP token/profile endpoints are blocked so tokens never reach the browser. Keep the secret stable and backed up.
- **More than one Google account per business.** Explicit signed-in `linkSocial` with `account.accountLinking.allowDifferentEmails: true` supports different emails ([account linking](https://www.better-auth.com/docs/concepts/users-accounts#account-linking)). The calendar settings UI ships in 2C. Every linked Google identity must also pass the instance email allowlist; linking does not grant ownership of another user's businesses.
- **Client.** A small interface, `CalendarProvider`, with `listCalendars`, `freeBusy(calendarIds, from, to)`, `createEvent`, `updateEvent`, `deleteEvent`. Two implementations: Google (plain `fetch` against the REST API, no SDK) and an in-memory fake used by tests and by `E2E_FAKE_GOOGLE=1`.
- **Caching.** Free/busy for slot listing may be cached for up to 60 seconds per business and range. The booking write path never uses the cache.
- **Failure.** Any auth failure marks the link `needs_reconnect`. While any blocking calendar's link is in that state, the slots endpoint returns no slots and a `calendar_unavailable` reason (S6-3: fail closed).
- Calendar links persist write capability from CalendarList accessRole; only owner/writer calendars can receive bookings. If a selected destination disappears or loses write access, availability fails closed until a writable destination is selected. Unlinking the destination account is refused until another account receives bookings.
- **Reconnecting.** Reconnect goes through Better Auth's `linkSocial`, not a plain sign-in: only linking updates the stored scopes, so an owner who unticked a calendar permission at first consent stays broken until they reconnect that way. A 403 from Google counts as an auth failure only for `insufficientPermissions`, `authError` and `ACCESS_TOKEN_SCOPE_INSUFFICIENT`; any other 403 (for example no write access to one shared calendar) is an ordinary calendar error and must not mark the link `needs_reconnect`.
- **Booking calendar repair.** If the chosen booking calendar disappears or becomes read-only, it moves to that account's primary or first writable calendar and the owner is told. If its account only needs a reconnect, the choice is kept: bookings are never redirected to another account because of a broken connection, slots fail closed, and the choice is still there after reconnecting.
- **Self-hosting trap.** A Google OAuth client left in "Testing" publishing status expires refresh tokens after 7 days. The self-host guide must cover moving it to production.

## 7. Public API (`/api/v1`)

Every request carries `X-OpenSlots-Key: os_pk_…`. The server resolves the business from the key and checks the `Origin` header against the business's allowed origins; the instance's own origin is always allowed. CORS headers echo only an allowed origin. Errors are `{ error: { code, message } }`, with these codes:

| Code | Status | When |
| --- | --- | --- |
| `invalid_request` | 400 | zod validation failed |
| `invalid_key` | 401 | missing or unknown publishable key |
| `origin_not_allowed` | 403 | `Origin` is not an allowed origin |
| `not_found` | 404 | unknown service or manage token |
| `slot_taken` | 409 | the start is no longer open |
| `booking_not_changeable` | 409 | cancel or reschedule of a booking that is cancelled or in the past |
| `rate_limited` | 429 | over the rate limit |
| `internal_error` | 500 | anything unexpected |
| `calendar_unavailable` | 502 | Google failed, or a blocking calendar needs reconnecting |

The request and response shapes below are zod schemas in `@openslots/core` (`packages/core/src/api.ts`); the server and `@openslots/react` both import them.

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `GET /business` | Business name, timezone, active services | `{ name, slug, timezone, services: [{ id, name, slug, description, color, durationMin, askPhone, askNotes, windowDays? }] }`. `windowDays` is the service's booking window (days after today in the business timezone); optional in the contract so older servers stay valid, and the server sends it. Cacheable for 60 seconds |
| `GET /slots?service=&from=&to=&tz=` | Open slots | `from`/`to` are dates in `tz`, at most 62 days apart; `tz` defaults to the business timezone. Returns `{ timezone, days: { 'YYYY-MM-DD': ['ISO start', …] }, reason? }` grouped by date in `tz`, only dates with slots. `reason: 'calendar_unavailable'` when slots are withheld (section 6) |
| `POST /bookings` | Create a booking | Body `{ serviceId, start, timezone, customer: { name, email, phone?, notes? }, website? }`; `website` is the honeypot. `201 { id, start, end, manageUrl }`, or `409 slot_taken` |
| `GET /manage/:token` | Booking summary for the manage page: `{ id, status, start, end, timezone, service, business, customer: { name, email } }`. Cancel and reschedule return the same shape | Token is 32 random bytes, base64url; only its SHA-256 hash is stored |
| `POST /manage/:token/cancel` | Cancel | |
| `POST /manage/:token/reschedule` | Move to `{ start }` | Same rules as create |

Customer fields follow the service: when `askPhone` is true the phone is required, and when it is false a phone is not accepted (it is stripped); notes are always optional, and stripped when `askNotes` is false. `customerFieldsSchema` stays permissive (phone and notes optional); both the booking form and `POST /bookings` validate the customer with `customerFieldsFor({ askPhone, askNotes })` from `@openslots/core`, which applies these rules, so the two cannot disagree.

Protection: zod validation and length limits on every field; rate limits per key and IP (suggested: 60 slot reads and 10 booking attempts per minute), stored in MongoDB with a TTL index so it works on one or many instances; a hidden honeypot field in the form; no customer data is ever returned by list endpoints.

Admin actions (S2 to S7) use Next.js server actions or route handlers behind the session, and every query is filtered by a business the session's user owns. A test must prove one user cannot read or change another user's business.

## 8. `@openslots/react`

- Exports: `BookingFlow`, `SlotPicker`, `ServiceList`, `useBusiness`, `useSlots`, `createClient` (typed `fetch` wrapper), `OpenSlotsError`, and types. Styles are a separate import: `@openslots/react/styles.css`.
- Common props: `host`, `publishableKey` (and optionally `fetch`), or a `client` made with `createClient`. All components take `theme?` and `className?`. `BookingFlow` also takes `service?` (id or slug; skips the service step), `onBooked?`, `timezone?`. `SlotPicker` takes `service` (id, slug or service object), `value?` (UTC ISO start), `onChange?` (with `{ start, end, date, timezone }`), `timezone?`, `onTimezoneChange?`. `ServiceList` takes `onSelect` and `selected?`.
- Client: one method per section 7 endpoint (`getBusiness`, `getSlots`, `createBooking`, `getBooking`, `cancelBooking`, `rescheduleBooking`). It sends `X-OpenSlots-Key` with `credentials: 'omit'`, validates requests and responses with the `@openslots/core` schemas, and throws one `OpenSlotsError` whose `code` is an API error code, `network_error` (no response) or `invalid_response` (a response outside the contract). A bare status with no error body maps to its code; a bare 409 is `slot_taken`, or `booking_not_changeable` for cancel. Aborts are rethrown as they are.
- Hooks fetch with plain `useEffect` and `AbortController`; a response for inputs that have changed is aborted and never applied. No data-fetching library.
- The slot picker asks for one calendar month at a time in the customer's timezone (detected on the client after mount, changeable, with the business timezone shown when different). On first load it skips up to two empty months. The month buttons stop at the current month and at the month containing today plus the service's `windowDays` in the business timezone; when a server does not send `windowDays`, they stop 24 months ahead. Offered times are labelled with the local time; when a wall time is ambiguous (a repeated hour on a daylight-saving fall-back day), the zone abbreviation or UTC offset is added to the visible label and the accessible name.
- Props that change after mount are applied. `timezone` sets the customer timezone and a later change of the prop replaces it, keeping the chosen instant and moving the calendar to its date in the new zone; the customer can still change it in the dropdown (`onTimezoneChange` reports that). `SlotPicker`'s `value` is controlled when the prop is passed (including `null`): the picker shows exactly that value and reports choices through `onChange`. When `value` is omitted the picker keeps its own selection. A change of the resolved service, `host`, `publishableKey` or `client` clears the selection: an uncontrolled picker drops it, and a controlled one ignores the old value and calls `onChange(null)` once. `BookingFlow` treats a change of `service`, `host`, `publishableKey` or `client` the same way: the chosen time is cleared and the flow goes back to the time step (or the service step when no service is fixed).
- While a booking is being submitted, the journey is locked (Back is disabled and a second submit is ignored; a synchronous in-flight guard stops a rapid double submit from sending two requests). The confirmation is rendered from a snapshot of what was submitted and what the server returned, never from the current selection. The manage link is rendered only for `http:` and `https:` URLs; anything else shows the confirmation without a link.
- `host` is the instance's URL (an absolute `http:` or `https:` URL, optionally with a path prefix, or a same-origin path); `createClient` throws a `TypeError` for a host with a query string, fragment, credentials or another protocol.
- Peer dependencies: `react` and `react-dom` 18 or 19 only; the package's Vitest suite runs against both (`packages/react/test/react-18` holds the React 18 copies). `@openslots/core` is the one dependency. No Next.js, no Tailwind requirement for the consumer, no analytics, no requests except to `host`. The built `dist/index.js` starts with `"use client"`.
- Styling: Tailwind is used at build time with the `os:` prefix and compiled by `packages/react/scripts/build-css.mjs` to one `styles.css`. A PostCSS step then places every selector under `.openslots`, turns `:root`, `html` and `body` into `.openslots`, unwraps cascade layers (so nothing joins a host's layers), drops `@property` and prefixes keyframes with `openslots-`. A scoped reset at specificity (0,1,0) beats a host's element and universal selectors, and the scoped utilities at (0,2,0) beat the reset. Sizes are in px so a host's root font size does not resize the widget. Fonts are the system stacks unless the host sets `--openslots-font-sans` and `--openslots-font-mono`; nothing is loaded from a CDN (C-1, C-4).
- Colors: every color is `var(--<shadcn name>, var(--openslots-default-<name>))`, so a page that defines `--primary`, `--accent`, `--card`, … (a shadcn host) themes the component, and any other page gets the Voltage defaults (C-2). Tokens must be complete colors (shadcn on Tailwind v4); a host with HSL-triplet tokens sets them on `.openslots` instead. Tokens come in pairs that must be overridden together, because a foreground cannot be derived safely: `--primary` with `--primary-foreground`, `--accent` with `--accent-foreground`, `--highlight` with `--highlight-foreground`, and `--background`, `--card` and `--muted` with `--foreground` and `--muted-foreground`. The soft surfaces are derived when only their base is set: without `--primary-soft`, a host's `--primary` gives `color-mix(in oklab, var(--primary) 16%, card)`, and likewise `--accent-soft` from `--accent`; with neither set, the Voltage defaults apply unchanged. The stylesheet uses only custom properties it defines or that have a fallback (a test over `dist/styles.css` checks this). Under `prefers-reduced-motion: reduce` the spinner stops and transitions are off. Inside the package `--accent` is the spec's tangerine. Dark mode for the defaults: `theme="auto"` (the default) follows a `.dark` ancestor, as next-themes and shadcn set it; `"system"` follows `prefers-color-scheme`; `"light"` and `"dark"` force it. A host's own tokens always win.
- Layout responds to the component's own width with container queries on the `.openslots` root: three columns at 760px and above, stacked below with times as a wrapping grid (S9-1, S9-2). The root has `container-type: inline-size`, so it takes its width from its parent and must not be shrink-wrapped (for example as a bare flex item).
- The hosted pages in `apps/web` consume this package from the workspace; they must not have a private copy of the booking UI. The app imports the TypeScript source and the compiled `dist/styles.css`; `dev`, `dev:fake` and `build` build the stylesheet first, and `dev:fake` keeps it rebuilt while running.
- A gallery route in `apps/web` (`/dev/gallery`, development only) renders each component against an in-memory mock of the public API (`@openslots/react/testing`, workspace only, never published) in its states, inside a hostile pretend host page (C1), at a resizable width and in a 340px phone frame.
- Published under the `@openslots` npm scope with provenance from CI. Publishing is a manual, maintainer-approved step.

## 9. Security and privacy

- Secrets only in environment variables. `.env.example` documents each one.
- OAuth tokens encrypted at rest; never logged; never sent to the browser.
- The publishable key grants only: read business, read slots, create a booking, and manage a booking with its token.
- Manage tokens are single-booking, unguessable, stored hashed.
- `OPENSLOTS_ALLOWED_EMAILS` (comma-separated, optional) restricts who may sign in to an instance. It is checked at sign-in/linking only; removing an email does not terminate existing sessions. Google emails must be verified. When unset, any Google account may sign in; the self-host guide says so plainly.
- Customer data held: name, email, optional phone and notes. No tracking of customers; PostHog is off by default and never loaded on booking pages or by the npm package.
- Standard headers: CSP on app pages, `frame-ancestors` relaxed only for booking pages.

## 10. Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGO_CONNECTION_STRING` | yes | Database |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | yes | Auth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | Sign-in and calendar access |
| `OPENSLOTS_ALLOWED_EMAILS` | no | Sign-in allowlist |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | no | Analytics |
| `E2E_FAKE_GOOGLE` | no | Tests and local UI work only: use the in-memory calendar provider and enable the test sign-in at `/dev/sign-in` (the only time email and password sign-in exists). Must refuse to enable when `NODE_ENV=production`. `pnpm run dev:fake` sets it and starts an in-memory MongoDB |

## 11. Testing and CI

- **Unit:** slot engine (section 4), zod schemas, key and token helpers.
- **Integration (Vitest with a real MongoDB, via `mongodb-memory-server`):** booking write path including the concurrency test, cancel, reschedule, tenant isolation, rate limits, origin checks.
- **End to end (Playwright, fake Google):** owner setup; customer books on the hosted page; slot taken; reschedule; cancel; reconnect state; embedded component on a plain test page.
- **Visual:** each screen checked against the design spec in light and dark; screenshots attached to pull requests.
- **CI (GitHub Actions):** `pnpm install --frozen-lockfile`, format check, lint, typecheck, unit and integration tests, build, Playwright. Runs on every pull request, whatever its base branch, so stacked slices are checked too.

## 12. Deployment

- `Dockerfile` for `apps/web` (Next.js standalone output) and a `docker-compose.yml` with the app and MongoDB for a one-command local or small-server install.
- Works behind any reverse proxy; the maintainer deploys on Coolify.
- `docs/self-hosting.md`: Google Cloud project and OAuth client (including publishing it), environment variables, first run, creating indexes, upgrading.

## 13. Open technical questions

None block the build. Section 6 documentation checks were settled in slice 1B; live Google consent and refresh still require the maintainer validation in docs/google-validation.md.
