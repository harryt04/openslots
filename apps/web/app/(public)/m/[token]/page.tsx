import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { HostedFrame } from '@/components/custom/hosted-frame'
import {
  findBusinessForManageToken,
  instanceOrigin,
} from '@/lib/public-pages/lookup'

import { ManageBooking } from './manage-booking'

export const dynamic = 'force-dynamic'

// The token is the only credential: keep it out of search indexes, out of
// the Referer header, and out of the title.
export const metadata: Metadata = {
  title: 'Your booking',
  description: 'Reschedule or cancel your booking.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

type Props = { params: Promise<{ token: string }> }

/** S10: manage one booking, reached only by its unguessable link. */
export default async function ManagePage({ params }: Props) {
  const { token } = await params
  const business = await findBusinessForManageToken(token)
  if (!business) notFound()
  return (
    <HostedFrame>
      <ManageBooking
        host={instanceOrigin()}
        publishableKey={business.publishableKey}
        token={token}
      />
    </HostedFrame>
  )
}
