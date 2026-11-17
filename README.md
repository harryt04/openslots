# OpenSlots

Free, open source, self-hosted appointment booking. Sign in with Google, link your calendar, define services of any length, set the days you are bookable, and let customers pick an open slot, on a hosted page or inside your own site with React components from npm.

One install serves every business you run. MIT licensed.

> **Status: planning complete, build not started.** There is no runnable code yet.

## What it will do

- Services with their own durations, buffers and rules (a 30 minute trim, a 60 minute cut, a 180 minute color).
- Weekly hours with date overrides, per business.
- Google Calendar for conflicts and for the booking itself; Google sends the invitation.
- No double bookings.
- `@openslots/react`: a drop-in booking flow and slot picker for your other projects.

## Documents

- [Product requirements](docs/PRD.md)
- [Technical requirements](docs/TRD.md)
- [Design spec](docs/design/openslots-design.html) (open in a browser) and [how to use it](docs/design/README.md)
- [Orchestration plan](docs/ORCHESTRATION.md)
- [Agent instructions](AGENTS.md)

## License

[MIT](LICENSE)
