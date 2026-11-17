# syntax=docker/dockerfile:1

# OpenSlots: the Next.js app (admin, hosted booking pages, public API).
# Build from the repository root:  docker build -t openslots .

ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
# Keep in step with "packageManager" in package.json.
RUN npm install -g pnpm@11.28.12
WORKDIR /repo

# ---- dependencies: cached until a manifest or the lockfile changes ----------
FROM base AS deps
# The in-memory MongoDB used by tests would download a 120 MB binary here.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/react/package.json packages/react/
COPY packages/react/test/react-18/package.json packages/react/test/react-18/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM deps AS build
COPY . .
# Analytics are off unless a key is given at build time; it is inlined into
# the browser bundle, so it cannot be set later.
ARG NEXT_PUBLIC_POSTHOG_KEY=""
# The app reads these while Next collects page data during the build. These
# are placeholders: nothing connects, and the real values come from the
# environment when the container runs.
ENV NEXT_OUTPUT=standalone \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    MONGO_CONNECTION_STRING=mongodb://build-placeholder:27017 \
    BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime \
    BETTER_AUTH_URL=http://localhost:3000
RUN pnpm --filter @openslots/web build

# ---- runtime ----------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
