# OpenSlots: orchestration plan

For the agent coordinating the v1 build. You coordinate, delegate, review and integrate; builders write the code. Read [AGENTS.md](../AGENTS.md), the [PRD](PRD.md), the [TRD](TRD.md) and the [design spec](design/openslots-design.html) before delegating anything.

## Ground rules

1. **Model ceiling.** Builders and reviewers use only the models and reasoning levels in the table below. Nothing above medium. If a named model is unavailable, stop and tell the maintainer; do not substitute.
2. **One slice, one branch, one worktree, one pull request.** Never push to `main`.
3. **Cross-provider review.** The reviewer is always from the other provider than the builder. A reviewer is a new delegate given the diff, the slice brief and the relevant TRD sections, not the builder's summary. Fix small findings yourself; send large ones back to the builder.
4. **Merging.** Ask the maintainer once, at the start, whether you may merge a slice's pull request after review passes and CI is green. Without that, leave pull requests open and build dependent slices on top of the unmerged branch.
5. **Never without explicit approval:** publishing to npm, deploying, changing repository settings, deleting branches or worktrees that are not yours.
6. **Report honestly.** If a check fails or a step was skipped, say so with the output.
7. **Keep documents true.** If a slice proves the TRD wrong, the same pull request corrects the TRD.

## Models

| Role | Provider | Model | Reasoning |
| --- | --- | --- | --- |
| Complex logic, component design | Claude | `claude-opus-5-5` | medium |
| UI screens, docs-adjacent UI | Claude | `claude-sonnet-5-5` | medium |
| Documentation | Claude | `claude-haiku-5-5` | medium |
| Integrations, API, tests | Codex | `gpt-6.1-sol` | medium |
| Light review | either | as listed per slice | low |

## Slices

Slices that share a number run in parallel. A phase starts when the previous phase's contracts exist on its base branch.

| Slice | Work | Design IDs | TRD | Builder | Reviewer |
| --- | --- | --- | --- | --- | --- |
| **0** | Bootstrap: pnpm workspace from the scaffold; Tailwind v4 and new-york shadcn; Voltage tokens in `globals.css`; Geist fonts; Vitest and Playwright wired; CI workflow; `.env.example`; fill in the Commands section of `AGENTS.md` | T-1…T-6 | 1, 2, 10, 11 | Orchestrator, serially | Maintainer |
| **1A** | `packages/core`: zod schemas, shared types, `computeSlots` with the full test list | – | 3, 4 | Opus 5.5 · medium | Sol · medium |
| **1B** | Better Auth with Google and calendar scopes; sign-in allowlist; `CalendarProvider` interface with Google and fake implementations; settle every **Verify** item | S1 | 6, 9, 10 | Sol · medium | Opus 5.5 · medium |
| **1C** | App shell: sidebar, business switcher, create-business onboarding, businesses repository with ownership scoping, index script | shell, S1-3 | 3, 7 (admin scoping) | Sonnet 5.5 · medium | Sol · low |
| **2A** | Services list and editor with the live preview driven by `computeSlots` | S3, S4 | 3, 4 | Opus 5.5 · medium | Sol · low |
| **2B** | Schedules: weekly hours, multiple ranges, date overrides, timezone | S5 | 3 | Sonnet 5.5 · medium | Sol · low |
| **2C** | Calendar links: connect, list calendars, blocking switches, booking calendar, reconnect state | S6 | 6 | Sol · medium | Opus 5.5 · low |
| **3A** | Public API v1, booking write path with slot locks, publishable keys, allowed origins, rate limits, concurrency and isolation tests; Developers page | S7 | 5, 7, 9 | Sol · medium | Opus 5.5 · medium |
| **3B** | `@openslots/react` built against a mocked API to the TRD contract; scoped compiled CSS; gallery route | C1, S9, C-1…C-4 | 8 | Opus 5.5 · medium | Sol · low |
| **4A** | Hosted booking pages and the manage page, using the package against the real API | S8, S10 | 7, 8 | Sonnet 5.5 · medium | Sol · low |
| **4B** | Bookings dashboard with cancel and reschedule | S2 | 5 | Sol · medium | Opus 5.5 · low |
| **4C** | Playwright end-to-end suite on the fake provider; visual pass of every screen against the design spec in light and dark; security review of tokens, keys, public API and tenant isolation | all | 9, 11 | Sol · medium | Opus 5.5 · medium |
| **5** | `Dockerfile`, `docker-compose.yml`, `docs/self-hosting.md`, README rewrite; prepare (do not perform) the npm release | – | 12 | Haiku 5.5 · medium for docs; orchestrator for the rest | Maintainer |

3A and 3B must agree on the API contract in TRD section 7 before either starts; if 3A needs to change it, the TRD changes first and 3B is told.

## What every builder brief contains

- The slice row above, verbatim, and the goal in one sentence.
- Instruction to read `AGENTS.md`, the listed TRD sections, and the listed screens in the design spec.
- The exact base branch to start from.
- What is out of scope (the neighbouring slices).
- Definition of done, below.
- The required last line of its report: pull request URL, head commit, state of checks.

## Definition of done for a slice

- `pnpm run ci` passes locally and in CI.
- New behaviour has tests at the level the TRD names.
- For UI: the builder ran the app, opened the screen in a browser beside the design spec, and the pull request lists each acceptance check as met or not met, with light and dark screenshots.
- No raw colors, no color-only states (T-1, T-5).
- Documents updated where the slice changed a decision.
- Cross-provider review completed and its findings resolved or explicitly deferred with a reason.

## After slice 5

Hand back to the maintainer with: what was built, every check that is not met and why, the manual steps left (Google Cloud client, npm scope and publish, first deploy), and suggested first integration.
