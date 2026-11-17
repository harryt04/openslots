import { LinkIcon } from 'lucide-react'

import { HostedFrame } from '@/components/custom/hosted-frame'

export const metadata = {
  title: 'Booking not found',
  robots: { index: false, follow: false },
}

// One page for every bad token, whatever is wrong with it.
export default function ManageNotFound() {
  return (
    <HostedFrame>
      <div className="mx-auto max-w-md rounded-[14px] border bg-card px-6 py-9 text-center text-card-foreground">
        <LinkIcon className="mx-auto mb-3 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">
          We can&apos;t find that booking
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The link may be incomplete or no longer valid. Use the link from your
          confirmation, or contact the business.
        </p>
      </div>
    </HostedFrame>
  )
}
