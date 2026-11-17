# OpenSlots

OpenSlots is a free, open source, self-hosted appointment booking service. A business owner signs in with Google, connects Google Calendar, defines services of different lengths, and sets the days and hours they can be booked. Customers pick an open time on a hosted booking page, or inside the owner's own website with React components from npm.

It is for:

- **Owners** who take appointments, such as a hair stylist or a consultant, and want bookings in their Google Calendar with no double bookings.
- **Self-hosters** who want one install to serve several businesses, with no per-seat fee.
- **Developers** who want a working booking picker on their own site, themed to match it.

MIT licensed.

> **Status:** v1 has been built and tested against a fake Google Calendar. It has not yet been run against a live Google account or deployed. See [docs/google-validation.md](docs/google-validation.md) for the checks still to do.

## What v1 does

- Sign in with Google. The same consent grants calendar access. An optional allowlist limits who can sign in.
- One login can own several businesses, each with its own name, URL, timezone, services, hours, calendars and keys.
- Services with a name, description, color, duration, buffers, minimum notice, booking window and daily cap. A service can be paused.
- Weekly hours with any number of time ranges per day, and date overrides that close a day, shorten it or open a closed one.
- One or more linked Google accounts. Each calendar can block slots. Exactly one calendar receives new bookings. A broken connection is shown and stops times being offered.
- Customers choose a service, day and time, and enter their name and email. The booking becomes a Google Calendar event, and Google sends the invitation.
- No double bookings, even when two customers book the same time at once.
- Customers can cancel or reschedule with a private link. Owners can do the same from the dashboard.
- A bookings dashboard with upcoming, past and cancelled bookings, searchable by customer.
- A hosted booking page for each business, and a direct link for each service.
- `@openslots/react`: a full booking flow, a slot picker, a service list and headless hooks. It works in any React app, carries its own styles and can be themed.
- A publishable key and an allowed-sites list for each business.
- Light and dark appearance, designed to be readable for colorblind users.

## What v1 does not do

- Take payments.
- Support several staff per business, or round-robin assignment.
- Use calendars other than Google Calendar.
- Send email or SMS itself. Google sends the booking invitation.
- Handle recurring appointments or group bookings.
- Offer customer accounts, teams or roles.
- Offer a theme chooser or translations.

## Run it

You need Docker with the Compose plugin, a domain name, and HTTPS in front of the app. Before the first sign-in, you also need a Google OAuth client. The [self-hosting guide](docs/self-hosting.md) covers all of it, step by step.

```sh
git clone https://github.com/harryt04/openslots.git
cd openslots
cp .env.example .env        # then fill in the values, as the guide describes
docker compose up -d --build
```

## Embed it

Copy the snippet from the **Developers** page of your instance. It fills in your host and publishable key:

```tsx
import { BookingFlow } from '@openslots/react'
import '@openslots/react/styles.css'

export default function Book() {
  return (
    <BookingFlow
      host="https://book.your-domain.example"
      publishableKey="os_pk_replace-with-your-key"
    />
  )
}
```

Add your site to the business's **Allowed sites** first.

`@openslots/react` is not yet published to npm. The package is prepared at version `0.1.0`, and publishing is a step the maintainer approves ([docs/RELEASING.md](docs/RELEASING.md)). Until it is published, `pnpm add @openslots/react` will fail. The [self-hosting guide](docs/self-hosting.md#7-embedding-in-another-site) explains what to do meanwhile.

## Develop

You need Node.js 26 (see `.nvmrc`) and pnpm 11.

```sh
pnpm install
pnpm run dev:fake   # the whole app with an in-memory MongoDB and a fake Google Calendar
pnpm run ci         # lint, typecheck, test, build
pnpm run e2e        # end-to-end tests with Playwright, against dev:fake
```

`dev:fake` needs no Google account and no database. Its data is lost when it stops. The first `pnpm run e2e` needs a browser: `pnpm --filter @openslots/web exec playwright install chromium`.

[AGENTS.md](AGENTS.md) lists every command and the rules for contributors.

## Repository layout

```text
apps/web/          Next.js app: admin, hosted booking pages, public API
packages/core/     @openslots/core: slot engine, schemas and shared types, no I/O
packages/react/    @openslots/react: booking components, hooks and client
docs/              requirements, design spec, self-hosting and validation guides
```

## Documents

- [Product requirements](docs/PRD.md): what v1 is and is not.
- [Technical requirements](docs/TRD.md): stack, data model, slot engine, booking path, API.
- [Design spec](docs/design/openslots-design.html) (open it in a browser) and [how to use it](docs/design/README.md).
- [Self-hosting guide](docs/self-hosting.md): from a server to a running instance.
- [Google validation checklist](docs/google-validation.md): the checks to run against a real Google account.
- [Design checks](docs/design/CHECKS.md): each acceptance check of the design spec, met or not, with evidence.
- [Releasing the npm packages](docs/RELEASING.md).
- [Agent instructions and commands](AGENTS.md).

## License

[MIT](LICENSE)
