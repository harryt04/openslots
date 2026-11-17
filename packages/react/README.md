# @openslots/react

Booking components for [OpenSlots](https://github.com/harryt04/openslots), the free, self-hosted appointment booking service. Works in any React 18 or 19 app. No Tailwind, shadcn/ui or Next.js needed.

```tsx
import { BookingFlow } from '@openslots/react'
import '@openslots/react/styles.css'

export function Book() {
  return (
    <BookingFlow
      host="https://slots.example.com"
      publishableKey="os_pk_…"
      onBooked={(booking) => console.log(booking.manageUrl)}
    />
  )
}
```

Add your site to the business's allowed sites in OpenSlots first.

## Exports

| Export | What it is | Key props |
| --- | --- | --- |
| `<BookingFlow>` | The whole journey: service, day and time, details, confirmation. | `host`, `publishableKey`, `service?`, `onBooked?`, `timezone?`, `theme?`, `className?` |
| `<SlotPicker>` | Only the calendar and times, for apps with their own form. | `service`, `value?`, `onChange?`, `timezone?`, `onTimezoneChange?` |
| `<ServiceList>` | The bookable services with durations. | `onSelect`, `selected?` |
| `useBusiness`, `useSlots` | Headless hooks: `{ data, error, loading, refetch }`. | connection, and `service`, `from`, `to`, `timezone` |
| `createClient` | A typed client for the public API. Throws `OpenSlotsError` with a `code`. | `host`, `publishableKey`, `fetch?` |

Every component and hook takes either `host` and `publishableKey` or a `client` from `createClient`.

## Theming

Styles are scoped under the `.openslots` class and do not touch the rest of your page. Colors use shadcn/ui token names, so if your page defines `--primary`, `--primary-foreground`, `--accent`, `--accent-foreground`, `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--highlight`, `--primary-soft`, `--accent-soft`, `--destructive` or `--radius`, the components use yours. Otherwise they use OpenSlots' Voltage theme. Here `--accent` is the strong accent (the chosen time and key buttons), not a quiet hover color. Tokens must be complete colors; to set them only for OpenSlots, set them on `.openslots`.

Dark mode: `theme="auto"` (default) follows a `dark` class on an ancestor, as next-themes sets it; `theme="system"` follows the operating system; `"light"` and `"dark"` force it.

Fonts are the system fonts unless you set `--openslots-font-sans` and `--openslots-font-mono`.

The layout follows the component's own width: three columns at 760px and wider, stacked below. Give it a width (it is a block element; inside a flex row, set its width).

## Privacy

The components make requests only to `host`, send no cookies, and load nothing else: no fonts, no analytics.

MIT licensed.
