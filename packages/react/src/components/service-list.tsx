'use client'

import type { PublicService, ServiceColor } from '@openslots/core'

import { customerMessage } from '../errors'
import { useBusiness, type Connection } from '../hooks'
import { Icon } from './icons'
import { cx, Root, type Theme } from './root'
import { button, Loading, Notice } from './ui'

/** The service color strip. Color is decoration here: the name carries the meaning. */
const SWATCH: Record<ServiceColor, string> = {
  blue: 'os:bg-svc-blue',
  orange: 'os:bg-svc-orange',
  sky: 'os:bg-svc-sky',
  vermillion: 'os:bg-svc-vermillion',
  pink: 'os:bg-svc-pink',
  yellow: 'os:bg-svc-yellow',
}

export function ServiceSwatch({ color }: { color: ServiceColor }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'os:block os:w-1.5 os:self-stretch os:rounded-[3px] os:flex-none',
        SWATCH[color],
      )}
    />
  )
}

export interface ServiceButtonsProps {
  services: PublicService[]
  onSelect: (service: PublicService) => void
  /** The id of the service shown as chosen, if any. */
  selected?: string | null
}

/** The list itself, without fetching. Used by `ServiceList` and `BookingFlow`. */
export function ServiceButtons({
  services,
  onSelect,
  selected,
}: ServiceButtonsProps) {
  if (services.length === 0) {
    return (
      <Notice tone="info">
        There are no services open for booking right now. Please check back
        later.
      </Notice>
    )
  }
  return (
    <ul className="os:grid os:gap-2" aria-label="Services">
      {services.map((service) => {
        const isSelected = selected === service.id
        return (
          <li key={service.id}>
            <button
              type="button"
              onClick={() => onSelect(service)}
              aria-current={isSelected ? 'true' : undefined}
              className={cx(
                'os:flex os:items-center os:gap-3 os:w-full os:min-h-[56px] os:text-left os:p-3.5 os:rounded-lg os:border os:bg-card os:text-foreground os:transition-colors os:hover:border-primary os:hover:bg-primary-soft',
                isSelected
                  ? 'os:border-primary os:bg-primary-soft'
                  : 'os:border-border',
              )}
            >
              <ServiceSwatch color={service.color} />
              <span className="os:flex-1 os:min-w-0">
                <span className="os:block os:font-semibold">
                  {service.name}
                </span>
                {service.description ? (
                  <span className="os:block os:text-xs os:text-muted-foreground">
                    {service.description}
                  </span>
                ) : null}
              </span>
              <span className="os:ml-auto os:font-mono os:text-xs os:whitespace-nowrap">
                {service.durationMin} min
              </span>
              {isSelected ? (
                <Icon name="check" />
              ) : (
                <Icon name="chevronRight" />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export type ServiceListProps = Connection & {
  /** Called when the customer picks a service. */
  onSelect: (service: PublicService) => void
  /** Id of the service to show as chosen. */
  selected?: string | null
  theme?: Theme
  className?: string
}

/** The business's active services, with durations (C1 exports table). */
export function ServiceList({
  onSelect,
  selected,
  theme,
  className,
  ...connection
}: ServiceListProps) {
  const business = useBusiness(connection as Connection)
  return (
    <Root theme={theme} className={className}>
      {business.data ? (
        <ServiceButtons
          services={business.data.services}
          onSelect={onSelect}
          selected={selected}
        />
      ) : business.error ? (
        <Notice
          tone="error"
          action={
            <button
              type="button"
              className={button.outline}
              onClick={business.refetch}
            >
              <Icon name="refresh" />
              Try again
            </button>
          }
        >
          {customerMessage(business.error)}
        </Notice>
      ) : (
        <Loading label="Loading services…" />
      )}
    </Root>
  )
}
