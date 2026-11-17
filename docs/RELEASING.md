# Releasing the npm packages

OpenSlots publishes two packages from this repository: `@openslots/core` (slot engine, schemas, types) and `@openslots/react` (the booking components, which depend on core). Publishing is manual and needs the maintainer's approval every time. Nothing in CI publishes on its own.

Status when this was written (2026-11-17): **nothing has been published.** Neither package name exists on npm, and the `@openslots` scope has not been claimed.

## One-time setup (maintainer)

1. **Claim the scope.** On npmjs.com, create an organization named `openslots` (free for public packages). If the name is taken, the packages need a different scope: change `name` in `packages/core/package.json` and `packages/react/package.json`, the dependency in `packages/react/package.json`, the imports in `apps/web`, the snippet on the Developers page, and the documents.
2. **Allow this repository to publish.** For each package, under the package's settings on npmjs.com, add a trusted publisher: GitHub Actions, repository `harryt04/openslots`, workflow `release.yml`, environment `npm`. A package must exist before its settings do, so the very first publish of each package has to be done another way: either run `pnpm publish` once from your own machine after `npm login`, or create a granular access token limited to the `@openslots` scope, add it to the repository as the secret `NPM_TOKEN` in the `npm` environment, and add `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` to the Publish step for that first run. Remove the token afterwards.
3. **Create the `npm` environment** in the repository's settings (Settings, Environments) and add yourself as a required reviewer, so every publish waits for your approval. This is a repository settings change, which is why it is listed here and not done for you.

## Each release

1. Decide the version. Both packages are released together with the same version. Before 1.0, a breaking change to the components' props or to the API contract bumps the minor version.
2. Change `version` in `packages/core/package.json` and `packages/react/package.json`, commit through a pull request, and merge it.
3. On GitHub: Actions, "Release to npm", Run workflow on `main` with **Dry run** ticked. It lints, type-checks, tests (on React 18 and 19) and builds the two packages, checks the versions are new, and shows what would be published. Read the file list.
4. Run it again with **Dry run** unticked and approve the `npm` environment when asked. It publishes with provenance, so the package page on npm links back to the commit and workflow that built it.
5. Tag the commit (`git tag v0.1.0 && git push origin v0.1.0`) and write release notes.

## What gets published

Checked on 2026-11-17 by packing both packages and installing the tarballs into a fresh React 18 project:

- `@openslots/core`: `dist/index.js`, `dist/index.d.ts`, source map, README, license. Runtime dependencies: `zod` and `@date-fns/tz`.
- `@openslots/react`: `dist/index.js` (begins with `"use client"`), `dist/index.d.ts`, `dist/styles.css`, source map, README, license. Peer dependencies: `react` and `react-dom` 18 or 19. Dependency: `@openslots/core` at the same version (the workspace reference is rewritten by pnpm when packing).
- The fresh project type-checked with strict TypeScript and bundled with esbuild.
- Size of a page that imports `BookingFlow`, minified, without React: about 43 kB gzipped of JavaScript and 4 kB of CSS. Roughly 26 kB of that is zod, which validates every API response. Moving the contract to `zod/mini` would shrink it further; that is a follow-up, not done.

The app in `apps/web` uses the packages from source, so a release does not change the deployed instance.

## After the first release

- Check the install snippet on the Developers page against a real `pnpm add @openslots/react` in another project.
- Remove the "not yet published" notes from `README.md` and `docs/self-hosting.md`.
