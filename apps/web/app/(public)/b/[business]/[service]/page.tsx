import { BookingFlow } from '@openslots/react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { HostedFrame } from '@/components/custom/hosted-frame'
import {
  findActiveServiceBySlug,
  findBusinessBySlug,
  instanceOrigin,
} from '@/lib/public-pages/lookup'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ business: string; service: string }> }

async function resolve(params: Props['params']) {
  const { business: businessSlug, service: serviceSlug } = await params
  const business = await findBusinessBySlug(businessSlug)
  if (!business) return null
  const service = await findActiveServiceBySlug(business.id, serviceSlug)
  return service ? { business, service } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await resolve(params)
  if (!found) return { title: 'Page not found' }
  const { business, service } = found
  return {
    title: `${service.name} with ${business.name}`,
    description: `Book ${service.name} (${service.durationMin} min) with ${business.name} online. No account needed.`,
  }
}

/** The hosted page for one service: the service step is skipped. */
export default async function HostedServicePage({ params }: Props) {
  const found = await resolve(params)
  if (!found) notFound()
  const { business, service } = found
  return (
    <HostedFrame>
      <h1 className="sr-only">
        Book {service.name} with {business.name}
      </h1>
      <BookingFlow
        host={instanceOrigin()}
        publishableKey={business.publishableKey}
        service={service.id}
      />
    </HostedFrame>
  )
}
