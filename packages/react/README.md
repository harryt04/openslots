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

Every component and hook takes either `host` and `publishableKey` or a `client` from `createClient`. `host` is your instance's URL, optionally with a path prefix (`https://example.com/slots`); a query string or fragment is refused with a `TypeError`.

## Props that change

- `timezone` sets the customer's timezone. If you change the prop later, the new zone is used and a chosen time is kept (shown at its date and time in the new zone). Customers can still pick another zone from the dropdown; `SlotPicker` reports that through `onTimezoneChange`.
- `SlotPicker`'s `value` is controlled when you pass it, even as `null`: the picker shows exactly that value and tells you about choices through `onChange`. Leave `value` out and the picker keeps its own selection.
- When the service, `host`, `publishableKey` or `client` changes, the selection is cleared, because a time from one service's availability is not valid for another. A controlled `SlotPicker` ignores the old value and calls `onChange(null)` once; `BookingFlow` goes back to the time step.
- While `BookingFlow` is submitting, Back and a second submit do nothing. The confirmation always shows what was booked, even if a prop changed meanwhile.

## Theming

Styles are scoped under the `.openslots` class and do not touch the rest of your page. Colors use shadcn/ui token names, so if your page defines `--primary`, `--primary-foreground`, `--accent`, `--accent-foreground`, `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--highlight`, `--primary-soft`, `--accent-soft`, `--destructive` or `--radius`, the components use yours. Otherwise they use OpenSlots' Voltage theme. Here `--accent` is the strong accent (the chosen time and key buttons), not a quiet hover color. Tokens must be complete colors; to set them only for OpenSlots, set them on `.openslots`.

Some tokens come in pairs, because text sits on them. If you override one, override its partner too, or the text may not be readable:

| Set this | Together with |
| --- | --- |
| `--primary` | `--primary-foreground` |
| `--accent` | `--accent-foreground` |
| `--highlight` | `--highlight-foreground` |
| `--background`, `--card`, `--muted` | `--foreground`, `--muted-foreground` |

The soft surfaces are derived for you: if you set `--primary` but not `--primary-soft`, the soft surface is your primary mixed into the card color (`color-mix`), and likewise `--accent-soft` from `--accent`. Set them yourself to choose exact values. With none of these set, the Voltage colors apply unchanged.

Dark mode: `theme="auto"` (default) follows a `dark` class on an ancestor, as next-themes sets it; `theme="system"` follows the operating system; `"light"` and `"dark"` force it.

Fonts are the system fonts unless you set `--openslots-font-sans` and `--openslots-font-mono`.

Animation respects `prefers-reduced-motion`: the spinner stops and transitions are off.

The layout follows the component's own width: three columns at 760px and wider, stacked below. Give it a width (it is a block element; inside a flex row, set its width).

## Privacy

The components make requests only to `host`, send no cookies, and load nothing else: no fonts, no analytics.

MIT licensed.
