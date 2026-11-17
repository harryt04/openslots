'use client'

import type { ServiceColor } from '@openslots/core'
import { Copy, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/custom/status-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { setServiceActiveAction } from '@/app/actions/services'
import { SERVICE_COLOR_CLASS } from '@/lib/services/colors'
import { cn } from '@/lib/utils'

export type ServiceCardData = {
  id: string
  name: string
  color: ServiceColor
  durationMin: number
  summary: string
  publicPath: string
  active: boolean
}

/** One service on the S3 list. */
export function ServiceCard({ service }: { service: ServiceCardData }) {
  const [active, setActive] = useState(service.active)
  const [pending, startTransition] = useTransition()
  const switchId = `bookable-${service.id}`

  function toggle(next: boolean) {
    setActive(next)
    startTransition(async () => {
      const result = await setServiceActiveAction(service.id, next)
      if (!result.ok) {
        setActive(!next)
        toast.error(result.message ?? 'Could not update the service.')
        return
      }
      toast.success(
        next ? `${service.name} is bookable.` : `${service.name} is paused.`,
      )
    })
  }

  async function copy() {
    const url = new URL(service.publicPath, window.location.origin).toString()
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied.')
    } catch {
      toast.error('Could not copy. Select the link and copy it instead.')
    }
  }

  return (
    <Card
      className="gap-0 overflow-hidden py-0"
      data-testid="service-card"
      data-active={active}
    >
      <div
        aria-hidden="true"
        className={cn('h-1.5', SERVICE_COLOR_CLASS[service.color])}
      />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-[15px] font-semibold">
            <Link
              href={`/services/${service.id}`}
              className="rounded-sm underline-offset-4 hover:underline"
            >
              {service.name}
            </Link>
          </h2>
          <div className="flex flex-none items-center gap-2">
            <label htmlFor={switchId} className="text-xs text-muted-foreground">
              Bookable
            </label>
            <Switch
              id={switchId}
              checked={active}
              disabled={pending}
              onCheckedChange={toggle}
              aria-label={`Bookable: ${service.name}`}
            />
          </div>
        </div>
        <div className="mt-2 mb-0.5 flex items-baseline justify-between gap-2">
          <p className="font-mono text-[30px] leading-tight font-semibold tracking-[-0.03em]">
            {service.durationMin}
            <span className="font-sans text-sm font-normal tracking-normal text-muted-foreground">
              {' '}
              min
            </span>
          </p>
          {active ? null : <StatusBadge status="paused" />}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{service.summary}</p>
        <Separator className="mt-auto mb-3" />
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {service.publicPath}
          </span>
          <div className="flex flex-none items-center">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={copy}
              aria-label={`Copy link to ${service.name}`}
            >
              <Copy />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" asChild>
              <Link
                href={`/services/${service.id}`}
                aria-label={`Edit ${service.name}`}
              >
                <Pencil />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
