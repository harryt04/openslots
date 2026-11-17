# OpenSlots: product requirements

Status: approved for v1 build, 2026-11-16. Visual target: [design spec](design/openslots-design.html).

## 1. Summary

OpenSlots is a free, MIT-licensed, self-hosted appointment booking service. A business owner signs in with Google, links Google Calendar, defines services of different lengths, and sets which days and hours are bookable. Customers pick an open slot, either on a hosted page or inside the owner's own website through React components installed from npm.

## 2. Why

Hosted booking tools charge per seat per month for something a small business uses lightly. A person who runs several small businesses pays that several times. OpenSlots is one install that serves all of them, with no per-seat cost and no vendor lock-in.

## 3. Who it is for

| Person | Needs |
| --- | --- |
| **Owner** (hair stylist, consultant, any appointment business) | Say when they work, what they offer and how long each takes; have bookings land in their Google Calendar; never be double booked. |
| **Serial entrepreneur / self-hoster** | Run one OpenSlots install for several businesses; drop a booking picker into each business's own site. |
| **Customer** | See real open times and book in under a minute, on a phone, without creating an account. |
| **Developer integrating it** | Install a package, pass a key, get a working picker that matches the host site. |

## 4. Scope of v1

### In

- **R1 Sign in.** Google is the only sign-in method. The same consent grants calendar access.
- **R2 Businesses.** One login can own several businesses. Each has its own name, URL slug, timezone, services, schedules, calendars and keys. A switcher moves between them.
- **R3 Services.** Each service has a name, description, color, duration (presets from 15 to 180 minutes, or custom in multiples of 5 up to 8 hours), buffer before and after, start-time interval, minimum notice, booking window, optional daily cap, the schedule it uses, and which customer fields to collect. A service can be paused.
- **R4 Availability.** A business has one or more schedules. A schedule has a timezone, weekly hours with any number of time ranges per day, and date overrides that close a day, shorten it, or open a normally closed day.
- **R5 Calendars.** A business links one or more Google accounts. Each calendar can be set to block slots. Exactly one calendar receives new bookings. A broken connection is clearly shown and stops slots being offered.
- **R6 Slots.** An open slot lies inside the schedule, fits the service plus buffers, respects notice, window and daily cap, and does not overlap any Google event on a blocking calendar or any existing booking.
- **R7 Booking.** A customer chooses service, day, time, and enters name and email (phone and notes if the service asks). The booking becomes a Google Calendar event with the customer as a guest. Google sends the invitation.
- **R8 No double booking.** Two customers cannot book overlapping times, even at the same instant.
- **R9 Manage.** The customer gets a private link to cancel or reschedule. The owner can cancel or reschedule from the dashboard. Both update the Google event.
- **R10 Bookings dashboard.** Upcoming, past and cancelled bookings, grouped by day, searchable by customer.
- **R11 Hosted page.** A public page per business, and a direct link per service.
- **R12 npm components.** `@openslots/react` provides the full booking flow, a standalone slot picker, a service list, and headless hooks. It works in any React app, carries its own styles, and can be themed.
- **R13 Developer access.** Each business has a publishable key and a list of allowed sites.
- **R14 Self-hosting.** A documented path from clone to running instance, including Google Cloud setup, and a way to restrict who may sign in.
- **R15 Look.** As in the design spec: Voltage theme, color used meaningfully, light and dark, accessible to colorblind users.

### Out (not in v1)

Payments. Several staff per business and round robin. Calendars other than Google. Email or SMS sent by OpenSlots itself. Recurring appointments. Group bookings. Customer accounts. Teams and roles. A theme chooser. Translations.

## 5. Decisions already made

| Topic | Decision |
| --- | --- |
| Name and license | OpenSlots, MIT. |
| Theme | Voltage (violet primary, tangerine accent). |
| Bookable people | One calendar owner per business. |
| Customer email | Google Calendar invitation only. |
| Stack | The maintainer's standard scaffold: Next.js, TypeScript, Tailwind, shadcn/ui, Better Auth, MongoDB, PostHog, pnpm. Details in the [TRD](TRD.md). |

## 6. Key journeys

1. **Owner setup.** Sign in with Google, name the business, confirm weekly hours, add a service, copy the booking link. Target: under five minutes.
2. **Customer books.** Open link, choose service, choose day, choose time, enter details, see confirmation and receive a calendar invitation.
3. **Slot taken.** Customer submits a time someone else just took; they return to the time step with a plain message and fresh times.
4. **Customer reschedules.** Open the manage link, pick a new time, the calendar event moves.
5. **Developer embeds.** Add an allowed site, copy the snippet, see the picker working on their own page.
6. **Connection breaks.** Google access lapses; the owner sees "Needs reconnect" in the sidebar and on the Calendars page; customers see no available times until it is fixed.

## 7. Success criteria

- All acceptance checks in the design spec pass for every screen.
- A concurrency test firing many simultaneous bookings at one slot yields exactly one success.
- The slot engine passes its tests across daylight saving changes and for customers in a different timezone from the business.
- A fresh clone can be brought up by following the self-host guide alone.
- The maintainer's first real integration books a real appointment into a real Google Calendar.

## 8. Risks

| Risk | Handling |
| --- | --- |
| Google OAuth client left in "Testing" expires access every 7 days | Self-host guide covers publishing the client; R5's reconnect state covers the failure. |
| Google may require verification for calendar scopes on public instances | Each self-hoster uses their own client for their own accounts; documented. |
| An event added directly in Google between listing and booking | Free/busy is re-checked immediately before confirming. |
| Abuse of the public booking endpoint | Publishable key, allowed-site check, rate limit, input validation. |
| Open sign-in on a public instance | Optional email allowlist (R14). |
