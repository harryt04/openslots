import Link from 'next/link'
import { Suspense } from 'react'
import {
  dashboardRows,
  dashboardStats,
  dayGroups,
  weekRange,
  type BookingTab,
} from '@/lib/bookings/dashboard'
import { listServices } from '@/lib/services/repository'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { BookingRow, CopyBookingLink } from './bookings/booking-row'
import { OpenSlots } from './bookings/open-slots'
import { TriangleAlert } from 'lucide-react'
import {
  calendarAvailability,
  listLinks,
} from '@/lib/calendar-links/repository'
import { PageHeader } from '@/components/custom/page-header'
import { requireBusiness } from '@/lib/businesses/current'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>
}) {
  const { business } = await requireBusiness()
  const params = await searchParams
  const tab: BookingTab =
    params.tab === 'past' || params.tab === 'cancelled'
      ? params.tab
      : 'upcoming'
  const q = (params.q ?? '').slice(0, 200)
  const page = Math.max(
    0,
    Math.floor(Math.min(10000, Number(params.page) || 0)),
  )
  const [rows, stats, services] = await Promise.all([
    dashboardRows(business._id, tab, q, page),
    dashboardStats(business._id, business.timezone),
    listServices(business._id),
  ])
  const groups = dayGroups(rows.slice(0, 50), business.timezone)
  const today = weekRange(new Date(), business.timezone).today
  const colors: Record<string, string> = {
    orange: 'bg-svc-orange',
    blue: 'bg-svc-blue',
    sky: 'bg-svc-sky',
    vermillion: 'bg-svc-vermillion',
    yellow: 'bg-svc-yellow',
    pink: 'bg-svc-pink',
  }
  const url = (nextTab: string, nextPage = 0) =>
    `/?${new URLSearchParams({ tab: nextTab, q, page: String(nextPage) })}`

  const links = await listLinks(business._id)
  const hasDestination = links.some(
    (l) =>
      l.status === 'ok' &&
      l.accountId === business.bookingCalendar?.accountId &&
      l.calendars.some(
        (c) =>
          c.writable && c.calendarId === business.bookingCalendar?.calendarId,
      ),
  )
  return (
    <>
      <PageHeader
        title="Bookings"
        actions={<CopyBookingLink slug={business.slug} />}
        description={`Everything customers have booked with ${business.name}.`}
      />
      {(!(await calendarAvailability(business)).ok ||
        links.some((l) => l.status === 'needs_reconnect')) && (
        <Link
          href="/calendars"
          className="mb-4 flex items-center gap-2 rounded-lg bg-highlight p-4 text-highlight-foreground"
        >
          <TriangleAlert />
          {!hasDestination
            ? 'No booking calendar. Review calendars.'
            : 'Calendar connection needs attention. Review calendars.'}
        </Link>
      )}
      <p className="mb-4 text-xs text-muted-foreground">
        Times shown in {business.timezone}
      </p>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="font-mono text-3xl font-semibold">{stats.today}</p>
          <p className="text-xs text-muted-foreground">
            {stats.next
              ? `next at ${new Intl.DateTimeFormat('en-US', { timeZone: business.timezone, hour: 'numeric', minute: '2-digit' }).format(stats.next)}`
              : 'No more bookings today'}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">This week</p>
          <p className="font-mono text-3xl font-semibold">{stats.week}</p>
          <p className="text-xs text-muted-foreground">
            {Number(stats.hours.toFixed(1))} hours booked
          </p>
        </div>
        <div className="rounded-xl bg-accent-soft p-4">
          <p className="text-xs font-medium">Open slots this week</p>
          <Suspense
            fallback={
              <p className="py-3 text-sm text-muted-foreground">
                Loading openings…
              </p>
            }
          >
            <OpenSlots business={business} services={services} />
          </Suspense>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Booking filters"
          className="flex gap-1 rounded-lg bg-muted p-1"
        >
          {(['upcoming', 'past', 'cancelled'] as const).map((t) => (
            <Link
              key={t}
              aria-current={tab === t ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm capitalize focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${tab === t ? 'bg-card shadow-sm' : ''}`}
              href={url(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Link>
          ))}
        </nav>
        <form className="flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <Input
            name="q"
            aria-label="Search customers"
            placeholder="Search customers"
            defaultValue={q}
            maxLength={200}
          />
          <Button variant="outline" type="submit">
            Search
          </Button>
        </form>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {groups.map(({ day, items }) => (
          <section key={day}>
            <h2 className="flex justify-between bg-muted/50 px-4 py-2 text-xs font-semibold">
              <span>
                {day === today ? 'Today · ' : ''}
                {new Intl.DateTimeFormat('en-US', {
                  timeZone: 'UTC',
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                }).format(new Date(day + 'T12:00:00Z'))}
              </span>
              <span className="font-normal text-muted-foreground">
                {items.length} {items.length === 1 ? 'booking' : 'bookings'}
              </span>
            </h2>
            {items.map((b) => (
              <BookingRow
                key={String(b._id)}
                timezone={business.timezone}
                publishableKey={business.publishableKey}
                row={{
                  id: String(b._id),
                  serviceId: String(b.serviceId),
                  service: {
                    name: b.service.name,
                    durationMin: b.service.durationMin,
                  },
                  start: b.start.toISOString(),
                  end: b.end.toISOString(),
                  createdAt: b.createdAt.toISOString(),
                  customer: b.customer,
                  status: b.status,
                  rescheduled: !!b.rescheduledFrom,
                  cleanup: !!b.cleanup,
                  eventSync: !!b.eventSync,
                  color: services.some(
                    (s) => String(s._id) === String(b.serviceId),
                  )
                    ? (colors[b.service.color] ?? 'bg-muted-foreground')
                    : 'bg-muted-foreground',
                }}
              />
            ))}
          </section>
        ))}
      </div>
      {!rows.length && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <h2 className="font-semibold">
            No bookings {q ? 'match your search' : 'to show'}
          </h2>
          <p className="my-2 text-sm text-muted-foreground">
            Share your Copy booking link to invite customers, or embed booking
            from{' '}
            <Link className="underline" href="/developers">
              Developers
            </Link>
            .
          </p>
          {!services.length && (
            <Link className="block underline" href="/services">
              Add your first service
            </Link>
          )}
          {!business.bookingCalendar && (
            <Link className="block underline" href="/calendars">
              Connect a booking calendar
            </Link>
          )}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-3">
        {page > 0 && (
          <Link className="underline" href={url(tab, page - 1)}>
            Previous page
          </Link>
        )}
        {rows.length > 50 && (
          <Link className="underline" href={url(tab, page + 1)}>
            Next page
          </Link>
        )}
      </div>
    </>
  )
}
