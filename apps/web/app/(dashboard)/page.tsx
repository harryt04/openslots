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
      <p className="text-lg font-medium">
        Welcome, {session.user.name || session.user.email}
      </p>
    </>
  )
}
