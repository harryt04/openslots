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
- **Colors come from tokens.** No raw hex in components. Any state shown with color also needs an icon, label or text decoration; never rely on red versus green. The maintainer is colorblind.
- **Next.js 16 uses `proxy.ts`**, exporting `proxy`, not `middleware.ts`.
- **Secrets stay out of the repository.** Document new variables in `.env.example` and TRD section 10.
- **Every admin query is scoped** to a business owned by the session's user.

## Workflow

- Work on a task branch in an isolated worktree and open a pull request. Never push to `main`.
- One slice or one coherent change per pull request. Say what changed, why, how it was verified, and which design checks (`S4-2`, …) it satisfies, with screenshots for UI.
- Run `pnpm run ci` before opening a pull request, and report failures honestly.
- Merging, publishing to npm and deploying need the maintainer's explicit approval.

## Commands

To be filled in by the bootstrap slice once the workspace exists (`pnpm run dev`, `ci`, `test`, `e2e`, `create-indexes`). Do not invent commands that are not in `package.json`.
