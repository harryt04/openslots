import { requireBusiness } from '@/lib/businesses/current'
import { listLinks, ownedAccounts } from '@/lib/calendar-links/repository'
import { CalendarSettings } from './settings'
export default async function Calendars({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>
}) {
  const { notice } = await searchParams
  const { business, session } = await requireBusiness()
  const links = await listLinks(business._id)
  // Server request time is serialized once for consistent client hydration.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  return (
    <CalendarSettings
      now={now}
      notice={notice?.slice(0, 200)}
      timezone={business.timezone}
      links={links.map((l) => ({
        accountId: l.accountId,
        email: l.email,
        calendars: l.calendars,
        status: l.status,
        lastCheckedAt: l.lastCheckedAt.toISOString(),
        needsReconnectSince: l.needsReconnectSince?.toISOString(),
      }))}
      accounts={await ownedAccounts(session.user.id)}
      booking={
        links.some(
          (l) =>
            l.status === 'ok' &&
            l.accountId === business.bookingCalendar?.accountId &&
            l.calendars.some(
              (c) =>
                c.writable &&
                c.calendarId === business.bookingCalendar?.calendarId,
            ),
        )
          ? business.bookingCalendar
          : undefined
      }
    />
  )
}
