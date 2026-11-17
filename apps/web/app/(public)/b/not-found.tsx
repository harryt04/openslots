import { CalendarX } from 'lucide-react'

import { HostedFrame } from '@/components/custom/hosted-frame'

export const metadata = { title: 'Page not found' }

// One page for an unknown business, an unknown service and a paused service,
// so it says no more than the public page already does.
export default function BookingNotFound() {
  return (
    <HostedFrame>
      <div className="mx-auto max-w-md rounded-[14px] border bg-card px-6 py-9 text-center text-card-foreground">
        <CalendarX className="mx-auto mb-3 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">
          This booking page isn&apos;t available
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The link may be mistyped, or online booking has been turned off. Check
          the link or contact the business.
        </p>
      </div>
    </HostedFrame>
  )
}
