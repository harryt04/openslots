import { BookingFlow } from '@openslots/react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { HostedFrame } from '@/components/custom/hosted-frame'
import { findBusinessBySlug, instanceOrigin } from '@/lib/public-pages/lookup'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ business: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const business = await findBusinessBySlug((await params).business)
  if (!business) return { title: 'Page not found' }
  return {
    title: `Book with ${business.name}`,
    description: `Book an appointment with ${business.name} online. No account needed.`,
  }
}

/** S8: the hosted booking page. Everything inside the frame is the package. */
export default async function HostedBookingPage({ params }: Props) {
  const business = await findBusinessBySlug((await params).business)
  if (!business) notFound()
  return (
    <HostedFrame>
      <h1 className="sr-only">Book an appointment with {business.name}</h1>
      <BookingFlow
        host={instanceOrigin()}
        publishableKey={business.publishableKey}
      />
    </HostedFrame>
  )
}
