'use client'

import type { CreateBookingResponse, PublicService } from '@openslots/core'
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'

import { customerMessage, isOpenSlotsError } from '../errors'
import { useBusiness, useClient, type Connection } from '../hooks'
import {
  formatDateLong,
  formatDateShort,
  formatTime,
  formatTimeRange,
  localDateOf,
  timeZoneLabel,
} from '../time'
import {
  DetailsForm,
  emptyDraft,
  validateCustomer,
  type CustomerDraft,
  type FieldErrors,
} from './details-form'
import { Icon } from './icons'
import { cx, Root, type Theme } from './root'
import { ServiceButtons } from './service-list'
import { SlotPanels, TimezoneField, useCustomerTimeZone } from './slot-picker'
import {
  BusinessMark,
  button,
  Loading,
  Notice,
  Steps,
  VisuallyHidden,
} from './ui'

export type BookingStep = 'service' | 'time' | 'details' | 'done'
const STEPS: BookingStep[] = ['service', 'time', 'details', 'done']

/** What `onBooked` receives: the API's response plus what was booked. */
export interface BookedResult extends CreateBookingResponse {
  service: PublicService
  /** The customer's timezone the booking was made in. */
  timezone: string
}

export type BookingFlowProps = Connection & {
  /** A service id or slug. When given, the service step is skipped. */
  service?: string
  /** Called once the booking exists. */
  onBooked?: (booking: BookedResult) => void
  /** The customer's timezone. Detected from the device when not given. */
  timezone?: string
  theme?: Theme
  className?: string
}

/**
 * Starting state, for the component gallery and tests only. Not part of the
 * published API; reach it through `@openslots/react/testing`.
 */
export interface BookingFlowInitialState {
  step?: BookingStep
  serviceId?: string
  start?: string | null
  draft?: Partial<CustomerDraft>
  showErrors?: boolean
  booking?: CreateBookingResponse
}

interface InternalProps {
  initial?: BookingFlowInitialState
}

/** The whole journey: service, day and time, details, confirmation (S8). */
export function BookingFlow(props: BookingFlowProps) {
  return <Flow {...props} />
}

export function Flow({
  service: serviceProp,
  onBooked,
  timezone: timezoneProp,
  theme,
  className,
  initial,
  ...connectionProps
}: BookingFlowProps & InternalProps) {
  const connection = connectionProps as Connection
  const client = useClient(connection)
  const business = useBusiness(connection)
  const [timezone, setTimezone] = useCustomerTimeZone(timezoneProp)

  const [step, setStep] = useState<BookingStep>(
    initial?.step ?? (serviceProp ? 'time' : 'service'),
  )
  const [serviceId, setServiceId] = useState<string | null>(
    initial?.serviceId ?? null,
  )
  const [start, setStart] = useState<string | null>(initial?.start ?? null)
  const [day, setDay] = useState<string | null>(null)
  const [draft, setDraft] = useState<CustomerDraft>({
    ...emptyDraft,
    ...initial?.draft,
  })
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [showErrors, setShowErrors] = useState(initial?.showErrors ?? false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<unknown>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [booking, setBooking] = useState<CreateBookingResponse | null>(
    initial?.booking ?? null,
  )

  const services = business.data?.services ?? []
  const fixed = serviceProp
    ? services.find((s) => s.id === serviceProp || s.slug === serviceProp)
    : undefined
  const service = fixed ?? services.find((s) => s.id === serviceId)

  // Move focus to the new step's heading, but not on first render.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const firstStep = useRef(true)
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  // Unmounting mid-request must not set state.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // The gallery's "validation errors" state shows errors straight away.
  useEffect(() => {
    if (showErrors && service) {
      const result = validateCustomer(draft, service)
      setErrors(result.errors ?? {})
    }
    // Only on entry; afterwards errors follow typing and submitting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service?.id])

  function go(next: BookingStep) {
    setStep(next)
  }

  function chooseService(s: PublicService) {
    setServiceId(s.id)
    setStart(null)
    setDay(null)
    setNotice(null)
    go('time')
  }

  function back() {
    setSubmitError(null)
    if (step === 'details') go('time')
    else if (step === 'time' && !fixed) {
      setServiceId(null)
      setStart(null)
      setNotice(null)
      go('service')
    }
  }

  function changeDraft(next: CustomerDraft) {
    setDraft(next)
    if (showErrors && service)
      setErrors(validateCustomer(next, service).errors ?? {})
  }

  async function submit() {
    if (!service || !start || !timezone) return
    const result = validateCustomer(draft, service)
    if (result.errors) {
      setShowErrors(true)
      setErrors(result.errors)
      setSubmitError(null)
      // Focus the first field with an error.
      requestAnimationFrame(() => {
        const first = cardRef.current?.querySelector<HTMLElement>(
          '[aria-invalid="true"]',
        )
        first?.focus()
      })
      return
    }
    setErrors({})
    setSubmitError(null)
    setSubmitting(true)
    try {
      const response = await client.createBooking({
        serviceId: service.id,
        start,
        timezone,
        customer: result.data,
        website,
      })
      if (!mounted.current) return
      setBooking(response)
      go('done')
      onBooked?.({ ...response, service, timezone })
    } catch (error) {
      if (!mounted.current) return
      if (isOpenSlotsError(error) && error.code === 'slot_taken') {
        // S8-4: back to the times, freshly loaded, with a plain message,
        // on the same day.
        setDay(localDateOf(new Date(start), timezone))
        setStart(null)
        setNotice(customerMessage(error))
        setReloadToken((n) => n + 1)
        go('time')
      } else {
        setSubmitError(error)
      }
    } finally {
      if (mounted.current) setSubmitting(false)
    }
  }

  function bookAnother() {
    setBooking(null)
    setStart(null)
    setDay(null)
    setNotice(null)
    setSubmitError(null)
    setShowErrors(false)
    setErrors({})
    if (fixed) go('time')
    else {
      setServiceId(null)
      go('service')
    }
  }

  // ------------------------------------------------------------- render

  const card =
    'os:bg-card os:text-foreground os:border os:border-border os:rounded-[14px] os:overflow-hidden'
  const three =
    'os:grid os:grid-cols-1 os:@min-[760px]:grid-cols-[240px_minmax(0,1fr)_230px]'
  const panelBorder =
    'os:border-b os:border-border os:@min-[760px]:border-b-0 os:@min-[760px]:border-r'

  let content: ReactNode
  if (!business.data || !timezone) {
    content = (
      <div className="os:p-5">
        {business.error ? (
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
          <Loading />
        )}
      </div>
    )
  } else if (step === 'service' || !service) {
    const missing = serviceProp && !fixed
    content = (
      <div className="os:p-5">
        <Steps current={0} />
        <div className="os:flex os:items-center os:gap-2 os:mb-3">
          <BusinessMark name={business.data.name} />
          <div>
            <p className="os:font-semibold">{business.data.name}</p>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="os:text-xs os:text-muted-foreground os:focus-visible:outline-none"
            >
              Choose a service
            </h2>
          </div>
        </div>
        {missing ? (
          <div className="os:mb-3">
            <Notice tone="info">
              That service isn&apos;t open for booking. Please choose another.
            </Notice>
          </div>
        ) : null}
        <ServiceButtons services={services} onSelect={chooseService} />
      </div>
    )
  } else if (step === 'done' && booking) {
    content = (
      <Done
        booking={booking}
        service={service}
        businessName={business.data.name}
        businessTimezone={business.data.timezone}
        timezone={timezone}
        email={draft.email.trim()}
        onAgain={bookAnother}
        headingRef={headingRef}
      />
    )
  } else {
    const info = (
      <Info
        step={step}
        businessName={business.data.name}
        businessTimezone={business.data.timezone}
        service={service}
        start={start}
        timezone={timezone}
        onTimezoneChange={setTimezone}
        onBack={step === 'time' && fixed ? undefined : back}
        headingRef={step === 'time' ? headingRef : undefined}
        className={cx('os:p-5', panelBorder)}
      />
    )
    content =
      step === 'time' ? (
        <div className={three}>
          {info}
          <SlotPanels
            connection={connection}
            serviceId={service.id}
            durationMin={service.durationMin}
            value={start}
            onChange={(slot) => {
              setStart(slot?.start ?? null)
              if (slot) {
                setDay(slot.date)
                setNotice(null)
              }
            }}
            timezone={timezone}
            initialDate={day}
            onDateChange={setDay}
            reloadToken={reloadToken}
            notice={
              notice ? (
                <Notice tone="warning" live="assertive">
                  {notice}
                </Notice>
              ) : null
            }
            footer={
              start ? (
                <button
                  type="button"
                  className={cx(button.accent, 'os:w-full os:mt-3')}
                  onClick={() => go('details')}
                >
                  Continue
                  <Icon name="chevronRight" />
                </button>
              ) : null
            }
            calendarClassName={cx('os:p-5', panelBorder)}
            timesClassName="os:p-5"
          />
        </div>
      ) : (
        <div className={three}>
          {info}
          <DetailsForm
            className="os:p-5 os:@min-[760px]:col-span-2"
            service={service}
            draft={draft}
            onDraftChange={changeDraft}
            website={website}
            onWebsiteChange={setWebsite}
            errors={errors}
            submitting={submitting}
            onSubmit={submit}
            headingRef={headingRef}
            status={
              submitError ? (
                <Notice
                  tone="error"
                  live="assertive"
                  action={
                    <button
                      type="button"
                      className={button.outline}
                      onClick={submit}
                      disabled={submitting}
                    >
                      <Icon name="refresh" />
                      Try again
                    </button>
                  }
                >
                  {customerMessage(submitError)} Your details are kept.
                </Notice>
              ) : null
            }
          />
        </div>
      )
  }

  return (
    <Root theme={theme} className={className}>
      <div ref={cardRef} className={card} data-step={step}>
        {content}
      </div>
    </Root>
  )
}

function Meta({
  icon,
  children,
  strong,
}: {
  icon: Parameters<typeof Icon>[0]['name']
  children: ReactNode
  strong?: boolean
}) {
  return (
    <div
      className={cx(
        'os:flex os:gap-2 os:items-start os:mt-2 os:text-sm',
        strong
          ? 'os:text-foreground os:font-semibold'
          : 'os:text-muted-foreground',
      )}
    >
      <span className="os:mt-0.5">
        <Icon name={icon} />
      </span>
      <div>{children}</div>
    </div>
  )
}

function Info({
  step,
  businessName,
  businessTimezone,
  service,
  start,
  timezone,
  onTimezoneChange,
  onBack,
  headingRef,
  className,
}: {
  step: BookingStep
  businessName: string
  businessTimezone: string
  service: PublicService
  start: string | null
  timezone: string
  onTimezoneChange: (tz: string) => void
  onBack?: () => void
  headingRef?: Ref<HTMLHeadingElement>
  className?: string
}) {
  const differs = businessTimezone !== timezone
  return (
    <div
      className={cx(
        'os:bg-linear-160 os:from-primary-soft os:to-transparent os:to-65%',
        className,
      )}
    >
      <Steps current={STEPS.indexOf(step)} />
      <div className="os:flex os:items-center os:gap-2">
        <BusinessMark name={businessName} />
        <span className="os:font-semibold">{businessName}</span>
      </div>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="os:mt-3.5 os:text-xl os:font-semibold os:tracking-tight os:focus-visible:outline-none"
      >
        {service.name}
      </h2>
      {service.description ? (
        <p className="os:text-sm os:text-muted-foreground">
          {service.description}
        </p>
      ) : null}
      <Meta icon="clock">
        <span className="os:font-mono os:text-xs">
          {service.durationMin} min
        </span>
      </Meta>
      {start ? (
        <Meta icon="calendar" strong>
          {formatDateShort(localDateOf(new Date(start), timezone))} ·{' '}
          <span className="os:font-mono">{formatTime(start, timezone)}</span>
          {differs ? (
            <span className="os:block os:text-xs os:font-normal os:text-muted-foreground">
              {formatDateShort(localDateOf(new Date(start), businessTimezone))},{' '}
              <span className="os:font-mono">
                {formatTime(start, businessTimezone)}
              </span>{' '}
              {timeZoneLabel(businessTimezone)}
            </span>
          ) : null}
        </Meta>
      ) : null}
      {step === 'time' ? (
        <div className="os:mt-3">
          <TimezoneField
            value={timezone}
            onChange={onTimezoneChange}
            businessTimezone={businessTimezone}
          />
        </div>
      ) : (
        <Meta icon="globe">{timeZoneLabel(timezone)}</Meta>
      )}
      {onBack ? (
        <button
          type="button"
          className={cx(button.ghost, 'os:mt-3.5 os:pl-1 os:-ml-1')}
          onClick={onBack}
        >
          <Icon name="chevronLeft" />
          Back
        </button>
      ) : null}
    </div>
  )
}

function Done({
  booking,
  service,
  businessName,
  businessTimezone,
  timezone,
  email,
  onAgain,
  headingRef,
}: {
  booking: CreateBookingResponse
  service: PublicService
  businessName: string
  businessTimezone: string
  timezone: string
  email: string
  onAgain: () => void
  headingRef: Ref<HTMLHeadingElement>
}) {
  const date = localDateOf(new Date(booking.start), timezone)
  const end = booking.end
  const differs = businessTimezone !== timezone
  return (
    <div className="os:px-6 os:py-9 os:text-center">
      <span className="os:mx-auto os:mb-3.5 os:grid os:place-items-center os:w-[52px] os:h-[52px] os:rounded-full os:bg-primary os:text-primary-foreground">
        <Icon name="check" size={26} />
      </span>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="os:text-2xl os:font-semibold os:tracking-tight os:focus-visible:outline-none"
      >
        You&apos;re booked
      </h2>
      <p className="os:mt-1.5 os:text-muted-foreground">
        {service.name} with {businessName}
      </p>
      <p className="os:mt-2.5 os:font-semibold">
        {formatDateLong(date)} ·{' '}
        <span className="os:font-mono">
          {formatTimeRange(booking.start, end, timezone)}
        </span>
      </p>
      <p className="os:text-sm os:text-muted-foreground">
        {timeZoneLabel(timezone)}
        {differs
          ? ` · ${formatDateShort(localDateOf(new Date(booking.start), businessTimezone))}, ${formatTime(booking.start, businessTimezone)} ${timeZoneLabel(businessTimezone)}`
          : null}
      </p>
      <p className="os:mt-2.5 os:text-sm os:text-muted-foreground">
        A calendar invitation is on its way to {email || 'your email'}.
      </p>
      <div className="os:mt-4.5 os:flex os:flex-wrap os:justify-center os:gap-2">
        <a
          href={booking.manageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={button.outline}
        >
          Reschedule or cancel
          <Icon name="link" size={14} />
          <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
        </a>
        <button type="button" className={button.ghost} onClick={onAgain}>
          Book another
        </button>
      </div>
    </div>
  )
}
