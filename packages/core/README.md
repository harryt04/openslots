# @openslots/core

The slot engine, zod schemas and shared types of [OpenSlots](https://github.com/harryt04/openslots), a free, self-hosted appointment booking service.

Most people want [`@openslots/react`](https://www.npmjs.com/package/@openslots/react), which depends on this package. Use this one directly if you are building your own client for an OpenSlots instance, or want the availability calculation on its own.

- `computeSlots(input)`: a pure function, with no I/O and no reading of the clock, that returns bookable start times from service rules, a weekly schedule with date overrides, busy intervals and "now". It handles time zones and daylight saving changes.
- zod schemas and TypeScript types for every request and response of the OpenSlots public API (`/api/v1`).
- Helpers: `groupSlotsByDate`, `scheduleRangeFor`, `lockBlocks`, `occupiedInterval`, `customerFieldsFor`.

It runs in browsers and in Node.js. ESM only.

```ts
import { computeSlots } from '@openslots/core'

const slots = computeSlots({
  service: { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 10, startIntervalMin: 30, minNoticeMin: 120, windowDays: 60 },
  schedule: { timezone: 'America/Denver', weekly: [[], day, day, day, day, day, []], overrides: [] },
  busy: [],
  bookedCountByDate: {},
  range: { from: '2026-12-01', to: '2026-12-07' },
  now: new Date(),
})
// { '2026-12-01': ['2026-12-01T16:00:00.000Z', …], … }
```

`weekly[0]` is Sunday; each day is a list of `{ startMin, endMin }` ranges in minutes after local midnight.

## License

MIT
