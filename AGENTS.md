# OpenSlots agent instructions

OpenSlots is a free, MIT-licensed, self-hosted appointment booking service: a Next.js app plus React components published to npm. `CLAUDE.md` is a symlink to this file; edit this file only.

## Read first

1. [Product requirements](docs/PRD.md): what v1 is and is not.
2. [Technical requirements](docs/TRD.md): stack, data model, slot engine, booking write path, API.
3. [Design spec](docs/design/openslots-design.html) and [how to use it](docs/design/README.md): the visual target, with screen IDs and acceptance checks.
4. [Orchestration plan](docs/ORCHESTRATION.md): the slices and their order.

If the code and these documents disagree, say so and fix whichever is wrong in the same pull request. Do not silently diverge.

## Rules

- **Stack is fixed:** Next.js App Router, TypeScript strict, Tailwind v4, shadcn/ui (new-york), Better Auth, MongoDB native driver, pnpm. Do not add Postgres, an ORM, another auth library or another UI kit.
- **MongoDB has no transactions here.** Booking correctness relies on the unique index on `slot_locks` (TRD section 5). Do not replace it with a read-then-write check.
- **The slot engine is pure** and lives in `packages/core`. Nothing else computes availability.
- **One booking UI.** The hosted pages use `@openslots/react` from the workspace.
- **Add shadcn components with the CLI** (`pnpm dlx shadcn@latest add <name>`); do not hand-edit `components/ui`.
- **Colors come from tokens.** No raw hex in components except the isolated Google brand mark SVG; `apps/web/app/globals.css` is the only file in the app that holds color values, and `packages/react/src/styles.css` the only one in the booking package. Any state shown with color also needs an icon, label or text decoration; never rely on red versus green. The maintainer is colorblind.
- **Next.js 16 uses `proxy.ts`**, exporting `proxy`, not `middleware.ts`.
- **Secrets stay out of the repository.** Document new variables in `.env.example` and TRD section 10.
- **Every admin query is scoped** to a business owned by the session's user.

## Workflow

- Work on a task branch in an isolated worktree and open a pull request. Never push to `main`.
- One slice or one coherent change per pull request. Say what changed, why, how it was verified, and which design checks (`S4-2`, …) it satisfies, with screenshots for UI.
- Run `pnpm run ci` before opening a pull request, and report failures honestly.
- Merging, publishing to npm and deploying need the maintainer's explicit approval.

## Commands

Run from the repository root. Node 26 (`.nvmrc`) and pnpm 11 (pinned in `package.json`).

| Command | What it does |
| --- | --- |
| `pnpm install` | Install the workspace. |
| `pnpm run dev` | Next.js dev server for `apps/web`. Needs `apps/web/.env.local` (see `.env.example`) and a MongoDB. |
| `pnpm run dev:fake` | The app with no outside services: in-memory MongoDB, fake calendar provider, test sign-in at `/dev/sign-in`. Also rebuilds `@openslots/react`'s stylesheet as its source changes. Set `PORT` to avoid clashing with another worktree. Data is lost on exit. |
| `pnpm run lint` | ESLint in every package. |
| `pnpm run typecheck` | `tsc --noEmit` in every package (with Next route types for the app). |
| `pnpm run test` | Vitest, unit and integration, in every package. |
| `pnpm run build` | Build the packages with tsup and the app with Next. The app build needs `MONGO_CONNECTION_STRING`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` set; placeholder values are fine. |
| `pnpm run ci` | lint, typecheck, test, build. Run before opening a pull request. |
| `pnpm run e2e` | Playwright against `dev:fake` on port 3100 (`E2E_PORT` to change). First run: `pnpm --filter @openslots/web exec playwright install chromium`. |
| `pnpm run create-indexes` | Create MongoDB indexes for the database selected by `NODE_ENV`. Reads `apps/web/.env.local` if present. |
| `pnpm run prettify` / `pnpm run format:check` | Prettier, write or check. CI checks. |

Run one package with `pnpm --filter @openslots/core test` (or `@openslots/react`, `@openslots/web`). `@openslots/react` also has `build:css` (compile `dist/styles.css` once) and `dev` (rebuild it on change); its `test` builds the package first, because some tests check `dist`, and then runs the suite twice: on React 19 and on React 18 (`test:react18`, with the React 18 copies held by the private workspace package `packages/react/test/react-18`).

## Things that are easy to get wrong

- **`bg-accent` is not the tangerine accent.** shadcn/ui uses the `accent` utility for quiet hover surfaces, so it maps to the spec's `--primary-soft`. The spec's tangerine `--accent` (chosen slot, key CTA) is `bg-accent-strong text-accent-strong-foreground`. The note at the top of `apps/web/app/globals.css` explains it.
- **Statuses go through `StatusBadge`** (`apps/web/components/custom/status-badge.tsx`), which pairs every state with an icon or strike-through. Add a new state there, not as an ad hoc colored badge.
- **Admin code gets its business from `requireBusiness()`** (`apps/web/lib/businesses/current.ts`). It returns `{ session, business, businesses }`: the current business, always owned by the session's user, or redirects to `/onboarding`. Call it in every admin page, server action and route handler; never read `businesses` by id yourself. The two exceptions are creating a business and switching to one, which run before a current business applies: they use `requireSession()` and the owner-scoped repository functions. Below it, `lib/businesses/repository.ts` has only owner-scoped functions (each takes the user id), so a new admin query for a business's data takes `business._id` from `requireBusiness()`. The `openslots_business` cookie is only a hint and is re-validated on every call.
- **Signed-in code calls `requireSession()`** from `apps/web/lib/session.ts`. The `(dashboard)` layout guards too, but a layout does not stop its page from rendering.
- **Development-only routes live under `apps/web/app/dev/`** and return 404 in production. `/dev/calendar` seeds and inspects fake account calendar state. `/dev/tokens` shows every token and base primitive in light and dark. `/dev/gallery` shows every `@openslots/react` export against a mock API, in each state, embedded in a hostile host page, resizable and at phone width.
- **`@openslots/react` styles are compiled, not part of the app's Tailwind.** Components use `os:`-prefixed classes that only `packages/react/scripts/build-css.mjs` compiles, into `packages/react/dist/styles.css` scoped under `.openslots`. The app imports it as `@openslots/react/styles.css`; `dev`, `dev:fake` and `build` build it first (with plain `pnpm run dev`, run `pnpm --filter @openslots/react dev` beside it to pick up style changes). A host's tokens win over the package's Voltage defaults, and in the package `--accent` is the tangerine, not the app's `bg-accent` remapping. Never style the package from the app, and do not add unprefixed Tailwind classes inside `packages/react`.
- **Workspace packages export TypeScript source** to the app (`exports` in their `package.json`); `publishConfig` points npm at `dist`. The app does not need the packages built first.
- **The shadcn CLI may write a wrong `cn` import** (`from "cn"`) into new components in this workspace. Correct it to `@/lib/utils`; that is the one hand-edit allowed in `components/ui`.
- **For browser checks use `agent-browser`** with a session named for your worktree, against `pnpm run dev:fake`.

## Fake calendar contract

Fake sign-in creates a Better Auth `providerId: 'google'` account record.
In both modes, look up the user's Google accounts and pass that record's id:
`calendarProvider({ id: account.id, userId: session.user.id })`. Never branch at call sites.
The default account has a writable `primary` calendar. Server-side tests can call
`seedFakeCalendar(accountId, { calendars, busy, authFailure })`; the returned state
records events and create/update/delete operations. State survives module reloads
in the development server through globalThis, and is lost on server exit.
The email/password route at /dev/sign-in remains fake-only and is absent in production.

## Calendar links contract

Slice 3A uses `calendarAvailability(business)` from `apps/web/lib/calendar-links/repository.ts` before querying slots or writing a booking. It returns blocking calendar account/user references and the booking destination, or `calendar_unavailable`; never bypass a failed result. On provider `CalendarAuthError`, call `markNeedsReconnect(business._id, accountId)`. Other errors must not change reconnect status. Calendar links persist `writable` from CalendarList permissions; event details are never read.
