import { upcomingCount } from '@/lib/bookings/dashboard'
import { listLinks } from '@/lib/calendar-links/repository'
import { AppSidebar } from '@/components/custom/app-sidebar'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { requireBusiness } from '@/lib/businesses/current'
import { countServices } from '@/lib/services/repository'
import { PostHogProvider } from '@/providers/posthogProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Redirects to /login, or to /onboarding when the user has no business.
  const { session, business, businesses } = await requireBusiness()
  const [serviceCount, links, bookingCount] = await Promise.all([
    countServices(business._id),
    listLinks(business._id),
    upcomingCount(business._id),
  ])
  const calendarsNeedAttention = links.some(
    (l) => l.status === 'needs_reconnect',
  )

  // PostHog wraps signed-in pages only. It must never load on the public
  // booking pages (TRD section 9).
  return (
    <PostHogProvider>
      <SidebarProvider>
        <AppSidebar
          businesses={businesses.map((b) => ({
            id: b._id.toHexString(),
            name: b.name,
          }))}
          currentId={business._id.toHexString()}
          user={{ name: session.user.name, email: session.user.email }}
          navMeta={{
            Services: { count: serviceCount },
            Bookings: { count: bookingCount },
            Calendars: { attention: calendarsNeedAttention },
          }}
        />
        <SidebarInset>
          <header className="flex h-12 items-center border-b px-4 md:hidden">
            <SidebarTrigger />
          </header>
          <div className="flex-1 p-4 md:px-7 md:py-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </PostHogProvider>
  )
}
