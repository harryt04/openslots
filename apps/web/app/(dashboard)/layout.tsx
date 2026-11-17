import { AppSidebar } from '@/components/custom/app-sidebar'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { requireSession } from '@/lib/session'
import { PostHogProvider } from '@/providers/posthogProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSession()

  // PostHog wraps signed-in pages only. It must never load on the public
  // booking pages (TRD section 9).
  return (
    <PostHogProvider>
      <SidebarProvider>
        <AppSidebar />
        <main className="flex flex-1 flex-col">
          <header className="flex h-14 items-center border-b px-4">
            <SidebarTrigger />
          </header>
          {children}
        </main>
      </SidebarProvider>
    </PostHogProvider>
  )
}
