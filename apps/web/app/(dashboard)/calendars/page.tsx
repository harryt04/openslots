import { requireBusiness } from '@/lib/businesses/current'
import { listLinks, ownedAccounts } from '@/lib/calendar-links/repository'
import { CalendarSettings } from './settings'
export default async function Calendars() {
  const { business, session } = await requireBusiness()
  const links = await listLinks(business._id)
  return (
    <CalendarSettings
      links={links.map((l) => ({
        accountId: l.accountId,
        email: l.email,
        calendars: l.calendars,
        status: l.status,
        lastCheckedAt: l.lastCheckedAt.toISOString(),
      }))}
      accounts={await ownedAccounts(session.user.id)}
      booking={business.bookingCalendar}
    />
  )
}
