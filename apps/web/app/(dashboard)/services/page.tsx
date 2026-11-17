import { Plus, Tag } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHeader } from '@/components/custom/page-header'
import { ServiceCard } from '@/components/custom/service-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireBusiness } from '@/lib/businesses/current'
import { ruleSummary } from '@/lib/services/format'
import { listServices } from '@/lib/services/repository'

export const metadata: Metadata = { title: 'Services' }

export default async function ServicesPage() {
  const { business } = await requireBusiness()
  const services = await listServices(business._id)

  const newButton = (
    <Button asChild>
      <Link href="/services/new">
        <Plus /> New service
      </Link>
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Services"
        description="What customers can book, and how long each one takes."
        actions={services.length ? newButton : null}
      />
      {services.length === 0 ? (
        <Card className="items-center gap-3 px-6 py-12 text-center">
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-full bg-primary-soft"
          >
            <Tag className="size-5" />
          </span>
          <h2 className="text-base font-semibold">No services yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add what customers can book at {business.name}, such as a 30 minute
            trim. Each service gets its own booking link.
          </p>
          {newButton}
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((s) => (
            <li key={s._id.toHexString()} className="grid">
              <ServiceCard
                service={{
                  id: s._id.toHexString(),
                  name: s.name,
                  color: s.color,
                  durationMin: s.durationMin,
                  summary: ruleSummary(s),
                  publicPath: `/b/${business.slug}/${s.slug}`,
                  active: s.active,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
