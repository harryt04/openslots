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

Collections belong to the app database. Application records have timestamps; lock documents have `createdAt`. IDs are `ObjectId` unless stated.

| Collection | Fields | Indexes |
| --- | --- | --- |
| `user`, `session`, `account`, `verification` | Managed by Better Auth. `account` holds Google tokens | Better Auth defaults |
| `businesses` | `ownerUserId`, `name`, `slug`, `timezone` (IANA), `bookingCalendar` `{accountId, calendarId}`, `publishableKey`, `allowedOrigins[]` | unique `slug`; unique `publishableKey`; `ownerUserId` |
| `services` | `businessId`, `name`, `slug`, `description`, `color` (token name), `durationMin`, `bufferBeforeMin`, `bufferAfterMin`, `startIntervalMin`, `minNoticeMin`, `windowDays`, `maxPerDay?`, `scheduleId`, `askPhone`, `askNotes`, `active` | unique `{businessId, slug}` |
| `schedules` | `businessId`, `name`, `timezone`, `weekly` (7 entries, each a list of `{startMin, endMin}`), `overrides[]` `{date: 'YYYY-MM-DD', ranges[]}` (empty ranges means closed) | `businessId` |
| `calendar_links` | `businessId`, `accountId` (Better Auth account), `email`, `calendars[]` `{calendarId, name, blocks, writable}`, `status` (`ok` or `needs_reconnect`), `lastCheckedAt`, `needsReconnectSince?` (first auth failure, cleared on successful refresh) | unique `{businessId, accountId}` |
| `calendar_link_returns` | `nonce`, `userId`, `businessId`, `accountId?` (reconnect intent; absent for link), `snapshot[]` (owned account ids), `expiresAt`, timestamps; consumed once by the authenticated return handler | unique `nonce`; TTL `expiresAt` (0 seconds) |
| `bookings` | `businessId`, `serviceId`, service snapshot, `start`, `end`, `status` (only pending, confirmed, cancelled), `rev` (integer from 0), `opId`, `prevOpId?`, `prevStart?`, `prevEnd?`, `capOpId?`, `prevCapOpId?`, `capManaged?: true`, `pendingOp?: {opId, startedAt}`, `expiresAt?`, `abandoned?: true`, `cleanup?: true`, `eventSync?: true`, `syncAt?`, `purgeAfter?`, customer, calendar destination snapshot, `googleEventId?`, `manageTokenHash`, `rescheduledFrom?` | unique manageTokenHash; {businessId,start}; {businessId,status,start}; {status,expiresAt}; cleanup; eventSync; pendingOp.startedAt; purgeAfter; {status,end}; {businessId,prevStart,prevEnd}; {businessId,serviceId,status,capManaged} |
| `cap_locks` | `businessId`, `bookingId`, `opId`, `createdAt`, `capKey = serviceId\|schedule-local date\|i` | unique {businessId,capKey}; bookingId; opId; createdAt |
| `slot_locks` | `businessId`, `block` (UTC epoch minutes ÷ 5), `bookingId`, `opId`, `createdAt` | **unique {businessId,block}**; bookingId; opId; createdAt |

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

MongoDB standalone has no transactions. Mutual exclusion rests on the unique
`slot_locks {businessId, block}` index and the startup guard, never on a read
followed by a write. The booking document is truth; Google and locks converge to
it. Every booking update filters on its id and the revision read, and increments
`rev`. A lost revision returns 409 and may undo only its operation's locks.
Deletes of failed initial pending inserts also filter on revision zero.

### State and ownership

Statuses are exactly pending, confirmed and cancelled. An operation UUID tags all
of its locks. `opId` owns the current occupied interval; `prevOpId` and
`prevStart/prevEnd` retain the previous interval until event sync succeeds.
`capOpId` owns a daily place independently of the current slot operation.
`prevCapOpId` retains the previous date's place. `pendingOp` is the revision
fenced reschedule claim. Pending attempts expire after three minutes.
`abandoned: true` means never confirmed and is excluded from every repository
listing and manage lookup. `cleanup` and `eventSync` express durable work,
not extra statuses. Admin callers use the exported cancel/reschedule functions
and repositories expose both flags.

### Create

Validate, load the exact schedule, and check fresh free/busy with computeSlots.
Insert pending at revision zero with a fresh operation id, expiry three minutes
away, and capManaged true before taking any locks if this service has a cap.
Insert slot locks, then a cap lock. Duplicate/full means delete only this
operation's locks and the pending revision-zero document, then 409 slot_taken.
Immediately before Google create require at least 60 seconds left on expiry.
Use the deterministic event id. Confirm by revision CAS from pending, while
expiry remains in the future, storing googleEventId and capOpId. Only a matched
confirmation returns 201.

Calendar failure or lost confirmation CAS transitions the pending revision to
cancelled, abandoned, cleanup, with purgeAfter one hour away; reconcile inline.
If that CAS loses, touch no locks; delete the deterministic event again to catch
a late create. Calendar failures return 502; lost confirmation returns 409.
Ambiguous database acknowledgements are re-read: an already confirmed creation
is retained, and a committed move never releases its own locks on an exception.

### Cancel and reschedule

Cancellation first CASes confirmed to cancelled with cleanup and purgeAfter one
hour away, clearing pendingOp; nothing is deleted before this write. Run
reconcile inline and return success even when cleanup remains. Already cancelled
is an idempotent success. A live syncAt lease is preserved so cleanup cannot
overtake an in-flight patch.

Reschedule refuses pendingOp younger than two minutes and any eventSync,
prevOpId or prevCapOpId with a try-again message. Occupied intervals including
both buffers must not overlap the current interval, uniformly for blocking and
nonblocking booking calendars. Never subtract the booking from Google busy data.
An inactive/missing service, missing schedule or past booking cannot move.

Claim revision r to r+1 with pendingOp N. Check fresh availability using the
original service duration/buffers snapshot, take N's slot locks, and take a new
cap place if changing local dates on a capped service. Failure releases only N's
locks and clears pendingOp by CAS r+1. Commit by CAS r+1 to the new interval,
opId N, previous operation/interval, rescheduledFrom and eventSync, clearing the
claim. Lost commit releases N and returns 409. A matched commit makes the move
durable; Google failure afterwards does not roll it back. Reconcile inline.
A concurrent cancellation before the response yields 409 rather than reporting
a successful move of a cancelled record.

### Daily caps

For cap n, count u other pending/confirmed bookings of that service on that
schedule-local date without capManaged true. These are legacy uncapped bookings;
new managed pending attempts never count in u. Try inserting positions
0 through n-u-1 until one wins the unique business/capKey index; otherwise 409.
A service with no cap sets no capManaged and takes no place. Existing places
remain when a cap is removed, until their bookings end.

A same-date move keeps capOpId and inserts/deletes no cap place. Cross-date moves
of a capped service take N's place, commit capOpId N and prevCapOpId old, then
reconcile the old place. A legacy cross-date move becomes capManaged.
computeSlots receives counts per service/date for confirmed and unexpired
pending bookings, independently of lock acquisition.

### Reconciliation and sweep

Reconcile always re-reads first and CASes a syncAt lease; a lease younger than
two minutes refuses another reconciler. Auth failures mark needs_reconnect.
Transient failures retain all time and work intent and clear the owned lease.

Cancelled cleanup deletes the event (deterministic id if no googleEventId).
404/410 are success. Only after success delete all slot and cap locks for that
booking id, then CAS clear cleanup and sync metadata. This is the only place
that deletes locks solely by bookingId; cancelled operations cannot commit.

Confirmed eventSync patches the event to the document time, omitting description
when no manage URL is available. A 404 recreates the deterministic event only
after checking that the confirmed revision still owns reconciliation. On success
delete only prevOpId's slot locks and prevCapOpId's cap lock, then CAS clear
eventSync, previous fields and the lease. If revision ownership was lost, stop.

The only background work is next/server after(), throttled to once per 30 seconds
per process. Each phase has a fixed 50-document batch and indexed predicates. Orphan and
ended-booking scans rotate their offset so retained records cannot permanently
starve later cleanup candidates:

1. Expired pending: CAS to cancelled/abandoned/cleanup with one-hour purgeAfter,
   then reconcile.
2. cleanup/eventSync: reconcile through the syncAt lease.
3. pendingOp older than five minutes: CAS clear, fencing the original commit.
4. Expired purgeAfter on cancelled records without cleanup: delete the event
   once more, then revision-filtered delete if abandoned, otherwise CAS clear
   purgeAfter and retain the cancellation record.
5. slot/cap locks created more than ten minutes ago: read each booking after the
   lock; delete only if absent, cancelled without cleanup, or pending/confirmed
   with none of opId, prevOpId, capOpId, prevCapOpId, pendingOp.opId owning it.
6. Confirmed bookings ended more than a day ago without sync/claim work: remove
   current operation locks.

Availability loads only records overlapping the expanded requested interval,
including confirmed, unexpired pending, cleanup and retained previous intervals.
All busy intervals include buffers. Missing schedules never fall back.

### Invariants and external limit

Confirmed bookings in one business never overlap occupied intervals. Every
future confirmed booking owns exactly its current slot locks and, during sync,
its previous interval; managed capped bookings hold their cap place. Success
requires confirmed state with locks. The daily cap is never exceeded by managed
admissions plus legacy usage. With Google healthy and time advanced beyond all
bounds, sweeps leave no orphan locks, cleanup, sync, claims, previous ownership
or abandoned documents; Google has exactly one event at each confirmed time.

Google cannot be fenced by database revision. Token acquisition (including a
retry) has a total 15-second budget; HTTP requests abort after 15 seconds.
The 60-second reserve immediately before create means the HTTP create leaves
this process at least 45 seconds before expiresAt, and expiry cleanup never
starts earlier than expiresAt. A lost confirmation deletes the event itself.
Tombstones persist for an hour even after cleanup; late-delete also applies to
normal cancellations. Known limit: a process dies between Google accepting a
create and cleanup, and Google applies the write over an hour late.
The fake provider has controllable pauses and missing-event patches return 404.

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
| `booking_not_changeable` | 409 | reschedule of a cancelled booking, or change of a past booking |
| `rate_limited` | 429 | over the rate limit |
| `internal_error` | 500 | anything unexpected |
| `calendar_unavailable` | 502 | Google failed, or a blocking calendar needs reconnecting |

The request and response shapes below are zod schemas in `@openslots/core` (`packages/core/src/api.ts`); the server and `@openslots/react` both import them.

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `GET /business` | Business name, timezone, active services | Cacheable for 60 seconds |
| `GET /slots?service=&from=&to=&tz=` | Open slots | `from`/`to` are dates in `tz`, at most 62 days apart; `tz` defaults to the business timezone. Returns `{ timezone, days: { 'YYYY-MM-DD': ['ISO start', …] }, reason? }` grouped by date in `tz`, only dates with slots. `reason: 'calendar_unavailable'` when slots are withheld (section 6) |
| `POST /bookings` | Create a booking | Body `{ serviceId, start, timezone, customer: { name, email, phone?, notes? }, website? }`; `website` is the honeypot. `201 { id, start, end, manageUrl }`, or `409 slot_taken` |
| `GET /manage/:token` | Booking summary for the manage page: `{ id, status, start, end, timezone, service, business, customer: { name, email } }`. Cancel and reschedule return the same shape | Token is 32 random bytes, base64url; only its SHA-256 hash is stored |
| `POST /manage/:token/cancel` | Cancel | Idempotent; durable cancellation succeeds even while event cleanup is pending |
| `POST /manage/:token/reschedule` | Move to `{ start }` | Revision-fenced commit; event sync may remain pending; another move must wait |

Rate limiting checks and increments the IP bucket first and stops immediately when it is exceeded; only an accepted IP attempt increments the shared key bucket. With zero trusted proxy hops there is no per-IP limit: the per-key bucket is the only rate-limit protection. When hops are set, the app must not be reachable except through the trusted proxy. Time bounds assume the app servers’ clocks agree.

Protection: zod validation and length limits on every field; rate limits per key and IP (suggested: 60 slot reads and 10 booking attempts per minute), stored in MongoDB with a TTL index so it works on one or many instances; a hidden honeypot field in the form; no customer data is ever returned by list endpoints.

Admin actions (S2 to S7) use Next.js server actions or route handlers behind the session, and every query is filtered by a business the session's user owns. A test must prove one user cannot read or change another user's business.

## 8. `@openslots/react`

- Exports: `BookingFlow`, `SlotPicker`, `ServiceList`, `useBusiness`, `useSlots`, `createClient` (typed `fetch` wrapper), and types.
- Common props: `host`, `publishableKey`. `BookingFlow` also takes `service?` (skip the service step), `onBooked?`, `timezone?`, `className?`.
- Peer dependencies: `react` and `react-dom` 18 or 19 only. No Next.js, no Tailwind requirement for the consumer. Marked `"use client"`.
- Styling: Tailwind is used at build time and compiled to one `styles.css`, with every rule scoped under `.openslots` and custom properties named like shadcn tokens (`--primary`, `--accent`, …) with Voltage defaults, so a shadcn host can override them (C-1, C-2, C-4).
- Layout responds to the component's own width with container queries: three columns at 760px and above, stacked below (S9-1).
- The hosted pages in `apps/web` consume this package from the workspace; they must not have a private copy of the booking UI.
- A gallery route in `apps/web` (development only) renders each component against the fake provider for visual checks.
- Published under the `@openslots` npm scope with provenance from CI. Publishing is a manual, maintainer-approved step.

## 9. Security and privacy

- Secrets only in environment variables. `.env.example` documents each one.
- OAuth tokens encrypted at rest; never logged; never sent to the browser.
- The publishable key grants only: read business, read slots, create a booking, and manage a booking with its token.
- Manage tokens are single-booking, unguessable, stored hashed. The manage link is in the calendar event description: anyone the owner shares that calendar with at "see all event details" can use it.
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
| `TRUSTED_PROXY_HOPS` | no | Default `0` means no per-IP limit; the per-key bucket is the only rate-limit protection. When set, the app must be reachable only through the proxy. App server clocks must agree. Count trusted hops from the right of X-Forwarded-For; use `1` behind one nginx/Coolify proxy that appends the client address. |
| `API_SLOTS_IP_LIMIT`, `API_WRITE_IP_LIMIT` | no | Per-minute IP limits, defaults 60 and 10. Positive integers. |
| `API_SLOTS_KEY_LIMIT`, `API_WRITE_KEY_LIMIT` | no | Separate per-minute key limits, defaults 600 and 100. Positive integers. |
| `E2E_FAKE_GOOGLE` | no | Tests and local UI work only: use the in-memory calendar provider and enable the test sign-in at `/dev/sign-in` (the only time email and password sign-in exists). Must refuse to enable when `NODE_ENV=production`. `pnpm run dev:fake` sets it and starts an in-memory MongoDB |

Booking reconciliation needs no new environment variables or worker process; it runs after API responses. Existing Google request bounds and proxy/rate-limit variables remain unchanged.

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

### Slice 3A API decisions and remaining limitation

Requests without Origin are accepted with a valid publishable key, with no
Access-Control-Allow-Origin header. This supports server clients and same-origin
GETs; keys are public, so origins are a browser policy, not authentication.
Preflight cannot send a key: OPTIONS answers uniformly for every origin without
looking up registered origins. Actual requests check the key's own business.
Preflight max-age is 600 seconds; allowed responses expose Retry-After.
Responses vary by Origin; business responses also vary by X-OpenSlots-Key and
are private-cacheable for 60 seconds. Free/busy is currently uncached.

Rate counters use MongoDB atomic increments and a TTL index, separately per key
and known IP. Defaults and overrides are in section 10. Unknown IPs skip the IP
bucket; trusted proxy hops select from the right, ignoring spoofed prefixes.
Race tests use distinct IPs rather than changing production defaults.

Cancel permits paused/deleted services, but only future confirmed bookings.
Reschedule requires a future confirmed booking and an active extant service;
missing schedules offer no slots. Both use revision-fenced booking writes and operation-owned locks. The original service duration/buffers snapshot is used
for the moved booking. Booking destination is snapshotted to ensure subsequent
calendar setting changes cannot redirect updates/deletes. Only the manage token
hash is persisted; the manage URL is sent to Google in the event description.
An admin reschedule without a token cannot reconstruct that URL.

Overlapping reschedules deliberately fail closed for v1 as described in section 5.
Better Auth's client sends signIn.social/linkSocial through fetch and navigates
with window.location.href from the redirect response; it does not submit a form
to Google. Keep form-action 'self'. Manage pages use frame-ancestors 'self';
public booking pages remain embeddable.

The gallery belongs to slice 3B and is absent from the slice 3A branch; the CSP smoke test currently checks its 404 response. Recheck the rendered gallery at integration.
