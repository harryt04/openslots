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
  app/(public)/b/[business]/   S8 hosted booking page, /b/[business]/[service]
  app/(public)/m/[token]/      S10 manage a booking
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
| `bookings` | `businessId`, `serviceId`, service snapshot, `start`, `end`, `status` (only pending, confirmed, cancelled), `rev` (integer from 0), `opId`, `prevOpId?`, `prevStart?`, `prevEnd?`, `capOpId?`, `prevCapOpId?`, `capManaged?: true`, `pendingOp?: {opId, startedAt}`, `expiresAt?`, `abandoned?: true`, `cleanup?: true`, `eventSync?: true`, `syncAt?`, `retryAt?`, `retryCount?`, `locksReleased?`, `lastWriteId?`, `purgeAfter?`, customer, calendar destination snapshot, `googleEventId?`, `manageTokenHash`, `rescheduledFrom?` | unique manageTokenHash; {businessId,start}; {businessId,status,start}; {status,expiresAt}; {cleanup,syncAt,retryAt}; {eventSync,syncAt,retryAt}; pendingOp.startedAt; {status,purgeAfter,syncAt,retryAt}; {status,locksReleased,end}; {businessId,prevStart,prevEnd}; {businessId,serviceId,status,capManaged,start} |
| `cap_locks` | `businessId`, `bookingId`, `opId`, `createdAt`, `capKey = serviceId\|schedule-local date\|i` | unique {businessId,capKey}; bookingId; opId; createdAt |
| `slot_locks` | `businessId`, `block` (UTC epoch minutes ÷ 5), `bookingId`, `opId`, `createdAt` | **unique {businessId,block}**; bookingId; opId; createdAt |

`schedules.weekly[0]` is Sunday (as `Date.getDay()`); a new business gets one schedule, Monday to Friday 09:00 to 17:00 in its timezone. Publishable keys are `os_pk_` plus 24 random bytes, base64url. Business slugs are global, 3 to 40 characters of `a-z0-9-`, and a reserved list of app routes is refused. Service slugs are unique only within their business, may be shorter, and have no reserved list. Admin code reaches businesses only through `requireBusiness()` in `apps/web/lib/businesses/current.ts`, which re-validates the remembered business (cookie `openslots_business`) against `ownerUserId` on every call. Creating a business and switching to one use the session and the owner-scoped repository directly. Schedules are reached only through `apps/web/lib/schedules/repository.ts`, which takes the business id from `requireBusiness()`, validates with `scheduleSchema` from `@openslots/core`, refuses to delete a business's last schedule, and refuses to delete one that a service (`services.scheduleId`, ObjectId or hex string) uses. Without transactions the last-schedule rule is re-checked after the delete and the document is put back if none remain. The in-use check and the delete are separate operations, so a service created at that instant can be left pointing at a missing schedule; anything that loads a service's schedule must treat a missing one as no availability and must never fall back to another schedule. Saving a schedule replaces it whole with no revision check: with two stale tabs the last save wins. Date overrides are labelled Closed, Extra day (the weekday is normally closed), Short day (less time, within the usual opening and closing), Usual hours (exactly the usual times) or Changed hours (anything else). Creating a business writes two documents without a transaction: if the schedule write fails, the business is deleted again. A service's slug is derived from its name when it is created (`cut-and-style`, then `cut-and-style-2`, …), unique per business through the `{businessId, slug}` index (a duplicate-key error moves to the next candidate), and kept when the service is renamed so shared links keep working. Admin service queries live in `apps/web/lib/services/repository.ts` and all take the business id from `requireBusiness()`.

Index creation lives in a script (`pnpm run create-indexes`, definitions in `apps/web/lib/mongo-utils.ts`), as in the scaffold; `pnpm run dev:fake` runs it on its fresh database. The app must not start serving bookings if either the `slot_locks` or `cap_locks` unique index is missing.

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
If that CAS loses, re-read the booking. Only this request's confirm can ever make the booking `confirmed`, so a stored `confirmed` (or a later, non-abandoned `cancelled`) means the confirm was applied and the request answers success, whatever `opId` the booking has by then: the customer may already have moved it. The create operation's locks are released and the deterministic event deleted again only when the document is gone or is an abandoned tombstone; anything else is left to the sweep. Calendar failures return 502; lost confirmation returns 409.
Ambiguous database acknowledgements are re-read: an already confirmed creation
is retained, and a thrown write is re-read using a unique lastWriteId; stored committed moves succeed. If a re-read fails, no locks are released and the sweep resolves the ambiguity.

### Cancel and reschedule

Cancellation first CASes confirmed to cancelled with cleanup and purgeAfter one
hour away, clearing pendingOp; nothing is deleted before this write. Run
reconcile inline and return success even when cleanup remains. Already cancelled
is an idempotent success. A live syncAt lease is preserved so cleanup cannot
overtake an in-flight patch. Any backoff left by an earlier failed calendar update is cleared, so the cancellation's own cleanup is attempted at once.

Reschedule refuses pendingOp younger than two minutes and any eventSync,
prevOpId or prevCapOpId with a try-again message. Occupied intervals including
both buffers must not overlap the current interval, uniformly for blocking and
nonblocking booking calendars. Never subtract the booking from Google busy data.
An inactive/missing service, missing schedule or past booking cannot move.

Claim revision r to r+1 with pendingOp N. Check fresh availability using the
original service duration/buffers snapshot, take N's slot locks, and take a new
cap place if changing local dates on a capped service. Failure first fences the claim by CAS r+1 and re-reads; only a move certainly not committed releases N's locks. Commit by CAS r+1 to the new interval,
opId N, previous operation/interval, rescheduledFrom and eventSync, clearing the
claim. A cleanly lost commit releases N and returns 409; a thrown acknowledgement is resolved from stored state, with another read after a lost cleanup CAS. Failed recovery reads release nothing. A matched commit makes the move
durable; Google failure afterwards does not roll it back. Reconcile inline.
A concurrent cancellation before the response yields 409 rather than reporting
a successful move of a cancelled record.

### Daily caps

For cap n, count u other pending/confirmed bookings of that service on that
schedule-local date without capManaged true. These are legacy uncapped bookings;
new managed pending attempts never count in u. Try inserting positions
0 through n-u-1 until one wins the unique business/capKey index; otherwise 409.
After insertion count all cap locks for this service/date, including positions above the current cap. If count plus u exceeds n, delete only this operation’s cap lock and return 409. Concurrent inserters may both back off. A service with no cap sets no capManaged and takes no place. Existing places
remain when a cap is removed, until their bookings end.

A same-date move keeps capOpId and inserts/deletes no cap place. Cross-date moves
of a capped service take N's place, commit capOpId N and prevCapOpId old, then
reconcile the old place. A legacy cross-date move becomes capManaged. If the cap has been removed, a
managed booking cannot move across dates: keeping its old-date place while
excluding it from future legacy counts would permit overbooking if a cap were
re-enabled. Refuse the move conservatively; cancel and book again instead.
computeSlots receives counts per service/date for confirmed and unexpired
pending bookings, independently of lock acquisition.

### Reconciliation and sweep

Reconcile always re-reads first and CASes a syncAt lease; a lease younger than
three minutes refuses another reconciler. Auth failures mark needs_reconnect.
Failures retain the lease and work intent and set retryAt with exponential backoff from one minute to one hour. Missing businesses follow the same backoff.

Cancelled cleanup deletes the event (deterministic id if no googleEventId).
404/410 are success. Only after success delete all slot and cap locks for that
booking id, then CAS clear cleanup and sync metadata. This is the only place
that deletes locks solely by bookingId; cancelled operations cannot commit.

Confirmed eventSync patches the event to the document time, omitting description
when no manage URL is available. The patch includes status confirmed to restore cancelled Google tombstones. A 404/410 recreates the deterministic event only
after checking that the confirmed revision still owns reconciliation. On success
delete only prevOpId's slot locks and prevCapOpId's cap lock, then CAS clear
eventSync, previous fields and the lease. If revision ownership was lost, stop.

The only background work is next/server after(), throttled to once per 30 seconds
per process. Each phase has a fixed 50-document batch and indexed predicates. Orphan scans rotate their offset. Ended bookings are marked locksReleased through CAS after deleting both lock types and excluded thereafter. Cleanup and purge work select only expired/absent leases and due/absent retryAt, oldest syncAt first. A finite set of stuck records cannot monopolize every sweep; retries wait one minute to one hour. This is not a fairness guarantee under unbounded arrivals:

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
   current operation locks and CAS mark locksReleased.

Availability loads only records overlapping the expanded requested interval,
including confirmed, unexpired pending, cleanup and retained previous intervals.
All busy intervals include buffers. Missing schedules never fall back.

### Invariants and external limit

Confirmed bookings in one business never overlap occupied intervals. Every
future confirmed booking owns exactly its current slot locks and, during sync,
its previous interval; managed capped bookings hold their cap place. Success
requires confirmed state with locks. New managed admissions count all managed positions plus legacy usage. Lowering a cap can leave existing usage above it; no further admission succeeds until usage is below the cap. With Google healthy and time advanced beyond all
bounds, sweeps leave no orphan locks, cleanup, sync, claims, previous ownership
or abandoned documents; Google has exactly one event at each confirmed time.

Google cannot be fenced by database revision. Token acquisition (including a
retry) has a total 15-second budget; HTTP requests abort after 15 seconds.
Providers check notAfter after token acquisition immediately before fetch. Create uses expiresAt minus 60 seconds; reconcile uses lease start plus 150 seconds. The three-minute lease comfortably exceeds the 30-second total token/request budget plus the 30-second margin, and expiry cleanup never
starts earlier than expiresAt. A lost confirmation deletes the event itself.
Tombstones persist for an hour even after cleanup; late-delete also applies to
normal cancellations. Known limit: a process dies between Google accepting a
create and cleanup, and Google applies the write over an hour late.
The fake checks deadlines after controllable pauses, retains cancelled tombstones, treats duplicate inserts as idempotent, and restores status on patch. A request already sent to Google cannot be fenced; arbitrarily delayed server application remains an external limit. Real tombstone behaviour needs the manual validation in google-validation.md.

Cap admission counts all managed cap locks for the service/local date after insertion, including positions outside a lowered or restored cap. Excess admission removes only its own operation lock and returns 409. Concurrent over-admissions may both back off. Legacy reads are date-bounded before local-date filtering. Availability uses separate current/previous time branches with business and bounded start ranges (including one day for maximum buffered duration), served by their respective indexes.

The backoff after a failed reconcile starts at one minute, but because the lease is kept on failure the first retry comes after about three. Cleanup selection is index-backed but reads every flagged booking each sweep, so its cost grows with the backlog.

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
| `GET /business` | Business name, timezone, active services | `{ name, slug, timezone, services: [{ id, name, slug, description, color, durationMin, askPhone, askNotes, windowDays? }] }`. `windowDays` is the service's booking window (days after today in the business timezone); optional in the contract so older servers stay valid, and the server sends it. Cacheable for 60 seconds |
| `GET /slots?service=&from=&to=&tz=` | Open slots | `from`/`to` are dates in `tz`, at most 62 days apart; `tz` defaults to the business timezone. Returns `{ timezone, days: { 'YYYY-MM-DD': ['ISO start', …] }, reason? }` grouped by date in `tz`, only dates with slots. `reason: 'calendar_unavailable'` when slots are withheld (section 6) |
| `POST /bookings` | Create a booking | Body `{ serviceId, start, timezone, customer: { name, email, phone?, notes? }, website? }`; `website` is the honeypot. `201 { id, start, end, manageUrl }`, or `409 slot_taken` |
| `GET /manage/:token` | Booking summary for the manage page: `{ id, status, start, end, timezone, service, business, customer: { name, email } }`. Cancel and reschedule return the same shape | Token is 32 random bytes, base64url; only its SHA-256 hash is stored |
| `POST /manage/:token/cancel` | Cancel | Idempotent; durable cancellation succeeds even while event cleanup is pending |
| `POST /manage/:token/reschedule` | Move to `{ start }` | Revision-fenced commit; event sync may remain pending; another move must wait |

Rate limiting checks and increments the IP bucket first and stops immediately when it is exceeded; only an accepted IP attempt increments the shared key bucket. With zero trusted proxy hops there is no per-IP limit: the per-key bucket is the only rate-limit protection. When hops are set, the app must not be reachable except through the trusted proxy. Time bounds assume the app servers’ clocks agree.

Customer fields follow the service: when `askPhone` is true the phone is required, and when it is false a phone is not accepted (it is stripped); notes are always optional, and stripped when `askNotes` is false. `customerFieldsSchema` stays permissive (phone and notes optional); both the booking form and `POST /bookings` validate the customer with `customerFieldsFor({ askPhone, askNotes })` from `@openslots/core`, which applies these rules, so the two cannot disagree.

Protection: public POST bodies are limited to 16 KiB while reading the stream (including unknown fields and cancel bodies), returning `400 invalid_request` before booking lookup or writes when exceeded; zod validation and length limits on every field; rate limits per key and IP (suggested: 60 slot reads and 10 booking attempts per minute), stored in MongoDB with a TTL index so it works on one or many instances; a hidden honeypot field in the form; no customer data is ever returned by list endpoints.

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
- Published under the `@openslots` npm scope with provenance from CI. Publishing is a manual, maintainer-approved step. The steps are in [RELEASING.md](RELEASING.md); the workflow is `.github/workflows/release.yml`, manual and a dry run by default.
- `@openslots/core` imports zod as a namespace (`import * as z from 'zod'`). Importing the `z` object instead pulls every zod locale and its JSON-schema code into an embedder's bundle: 108 kB gzipped against 43 kB.

## 9. Security and privacy

- Secrets only in environment variables. `.env.example` documents each one.
- OAuth tokens encrypted at rest; never logged; never sent to the browser.
- The publishable key grants only: read business, read slots, create a booking, and manage a booking with its token.
- Manage tokens are single-booking, unguessable, stored hashed. The manage link is in the calendar event description: anyone the owner shares that calendar with at "see all event details" can use it.
- `OPENSLOTS_ALLOWED_EMAILS` (comma-separated, optional) restricts who may sign in to an instance. It is checked at sign-in/linking only; removing an email does not terminate existing sessions. Google emails must be verified. When unset, any Google account may sign in; the self-host guide says so plainly.
- Customer data held: name, email, optional phone and notes. No tracking of customers; PostHog is off by default and never loaded on booking pages or by the npm package.
- Standard headers: CSP on app pages, `frame-ancestors` relaxed only for booking pages. Every page also sends `X-Content-Type-Options: nosniff` and a `Referrer-Policy`; manage pages send `no-referrer`, `Cache-Control: no-store` and `X-Robots-Tag: noindex`.
- Public customer pages (slice 4A): `/b/[business]` and `/b/[business]/[service]` may be framed by any site; `/m/[token]` only by this instance (`frame-ancestors 'self'`) and is `noindex` with `Referrer-Policy: no-referrer`, because the token in its URL is the credential. On both, `connect-src` is `'self'` only: the PostHog hosts are not allowed, and `PostHogProvider` is mounted only by the `(dashboard)` layout. A Playwright test asserts that no request leaves for another host. An unknown business, an unknown or paused service and every bad token get a plain 404 page. These pages follow the visitor's light or dark preference through the root `ThemeProvider` (a `dark` class on `<html>`, set before first paint), which `@openslots/react` reads with `theme="auto"`, so the page and the component cannot disagree. The page server resolves the business (and, for `/m`, the business behind the token) with the read-only lookups in `apps/web/lib/public-pages/lookup.ts`, then the browser calls `/api/v1` with that business's publishable key like any embedder.

## 10. Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGO_CONNECTION_STRING` | yes | Database |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | yes | Auth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | Sign-in and calendar access |
| `OPENSLOTS_ALLOWED_EMAILS` | no | Sign-in allowlist |
| `NEXT_PUBLIC_POSTHOG_KEY` | no | Analytics on signed-in pages, page views only. Read at build time. Events go through this origin at `/ingest` to PostHog's US endpoint; there is no host setting |
| `TRUSTED_PROXY_HOPS` | no | Default `0` means no per-IP limit; the per-key bucket is the only rate-limit protection. When set, the app must be reachable only through the proxy. App server clocks must agree. Count trusted hops from the right of X-Forwarded-For; use `1` behind one nginx/Coolify proxy that appends the client address. |
| `API_SLOTS_IP_LIMIT`, `API_WRITE_IP_LIMIT` | no | Per-minute IP limits, defaults 60 and 10. Positive integers. |
| `API_SLOTS_KEY_LIMIT`, `API_WRITE_KEY_LIMIT` | no | Separate per-minute key limits, defaults 600 and 100. Positive integers. |
| `OPENSLOTS_AUTO_INDEX` | no | Set to `0` to stop the server creating MongoDB indexes at start |
| `E2E_FAKE_GOOGLE` | no | Tests and local UI work only: use the in-memory calendar provider and enable the test sign-in at `/dev/sign-in` (the only time email and password sign-in exists). Must refuse to enable when `NODE_ENV=production`. `pnpm run dev:fake` sets it and starts an in-memory MongoDB |

Booking reconciliation needs no new environment variables or worker process; it runs after API responses. Lease, provider deadlines and exponential retry bounds are internal constants; no new variables. Existing Google request bounds and proxy/rate-limit variables remain unchanged.

## 11. Testing and CI

- **Unit:** slot engine (section 4), zod schemas, key and token helpers.
- **Integration (Vitest with a real MongoDB, via `mongodb-memory-server`):** booking write path including the concurrency test, cancel, reschedule, tenant isolation, rate limits, origin checks.
- **End to end (Playwright, fake Google):** owner setup; customer books on the hosted page; slot taken; reschedule; cancel; reconnect state; embedded component on a plain test page.
- **Visual:** each screen checked against the design spec in light and dark. The result is recorded check by check in [design/CHECKS.md](design/CHECKS.md). The pass is scripted (`VISUAL_PASS=1 pnpm --filter @openslots/web exec playwright test e2e/visual-pass.spec.ts --workers=1`): it measures contrast from rendered pixels, reads the outline at every Tab stop and saves a screenshot of each state, including one with color removed. Screenshots are written to the ignored `.screenshots/` folder, not committed.
- **Production smoke test (`pnpm --filter @openslots/web prod-smoke`, run in CI after the build):** against a production build, no analytics request leaves the sign-in, booking or manage pages, development-only routes return 404, and fake mode is refused.
- **Security tests:** direct attack tests call every admin server action and the calendar link routes with another owner's ids; a table-driven matrix covers every public API route against a missing, unknown and foreign key, a disallowed and `null` origin, an oversized body and a wrong method; the end-to-end suite asserts that no OAuth token reaches the browser and that server logs hold no manage token, full key or customer email.
- **CI (GitHub Actions):** `pnpm install --frozen-lockfile`, format check, lint, typecheck, unit and integration tests, build, Playwright. Runs on every pull request, whatever its base branch, so stacked slices are checked too.

## 12. Deployment

- `Dockerfile` for `apps/web` (Next.js standalone output) and a `docker-compose.yml` with the app and MongoDB for a one-command local or small-server install. The image runs as a non-root user and has a health check on `/api/health`. CI builds it and smoke-tests the running container.
- At start the server refuses to run in fake mode in production, then creates the MongoDB indexes (`apps/web/instrumentation.ts`). `OPENSLOTS_AUTO_INDEX=0` turns that off for operators who run `pnpm run create-indexes` themselves.
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

### Owner bookings dashboard (slice 4B)

The owner dashboard reads only the current business from `requireBusiness()`.
Upcoming and Past split on the booking start instant; Cancelled includes all
cancelled bookings. Abandoned attempts are excluded throughout. Lists return
50 rows per page (plus one lookahead), bounded by start and served by the
existing `{businessId,status,start}` index. Literal customer name/email search
escapes regular expression metacharacters and is capped at 200 characters;
it filters the tenant/status index scan rather than a global collection scan.
Today and Monday–Sunday week totals count confirmed bookings by business-local
start date and use snapshot durations. Openings load in a separate Suspense
boundary through `availableSlots`, with explicit unavailability on calendar
failure. Owner mutations validate inputs, reload the booking scoped to the
current business, then use the shared revision-based booking service.
