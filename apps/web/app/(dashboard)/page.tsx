import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import {
  calendarAvailability,
  listLinks,
} from '@/lib/calendar-links/repository'
import { PageHeader } from '@/components/custom/page-header'
import { requireBusiness } from '@/lib/businesses/current'

// Placeholder home. The bookings dashboard (S2) replaces it in slice 4B.
export default async function Home() {
  const { session, business } = await requireBusiness()

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
      <p className="text-lg font-medium">
        Welcome, {session.user.name || session.user.email}
      </p>
    </>
  )
}
