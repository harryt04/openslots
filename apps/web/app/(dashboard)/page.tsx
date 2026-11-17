import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import { listLinks } from '@/lib/calendar-links/repository'
import { PageHeader } from '@/components/custom/page-header'
import { requireBusiness } from '@/lib/businesses/current'

// Placeholder home. The bookings dashboard (S2) replaces it in slice 4B.
export default async function Home() {
  const { session, business } = await requireBusiness()

  return (
    <>
      <PageHeader
        title="Bookings"
        description={`Everything customers have booked with ${business.name}.`}
      />
      {(await listLinks(business._id)).some(
        (l) => l.status === 'needs_reconnect',
      ) && (
        <Link
          href="/calendars"
          className="mb-4 flex items-center gap-2 rounded-lg bg-highlight p-4 text-highlight-foreground"
        >
          <TriangleAlert />
          Calendar connection needs reconnecting. Review calendars.
        </Link>
      )}
      <p className="text-lg font-medium">
        Welcome, {session.user.name || session.user.email}
      </p>
    </>
  )
}
