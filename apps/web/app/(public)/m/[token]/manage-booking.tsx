'use client'

import {
  createClient,
  customerMessage,
  isOpenSlotsError,
  SlotPicker,
  type OpenSlotsError,
  type ManageSummary,
  type SelectedSlot,
} from '@openslots/react'
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  Globe,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { StatusBadge, type Status } from '@/components/custom/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  addMinutes,
  formatLongDate,
  formatTimeSpan,
  zoneName,
} from '@/lib/public-pages/format'

// The spec's tangerine accent marks the key action, as in the booking flow.
const KEY_CTA =
  'bg-accent-strong text-accent-strong-foreground hover:bg-accent-strong/90'

type View = 'view' | 'pick' | 'confirm'
type Problem = { title: string; text: string }

/**
 * The text for a failed manage call. The API words a few refusals for the
 * customer itself ("Try again in a moment.", the overlap refusal); those are
 * shown as written. Anything else uses the package's wording for its code.
 */
function hasCustomMessage(error: OpenSlotsError): boolean {
  return (
    error.status !== undefined &&
    error.message !== error.code.replaceAll('_', ' ') &&
    !error.message.startsWith('HTTP ')
  )
}

function problemFor(error: unknown): Problem {
  if (isOpenSlotsError(error)) {
    if (
      hasCustomMessage(error) &&
      (error.code === 'slot_taken' || error.code === 'booking_not_changeable')
    ) {
      return { title: "That didn't work", text: error.message }
    }
    if (error.code === 'slot_taken') {
      return { title: 'That time was just taken', text: customerMessage(error) }
    }
    if (error.code === 'booking_not_changeable') {
      return {
        title: "This booking can't be changed",
        text: customerMessage(error),
      }
    }
    if (error.code === 'calendar_unavailable') {
      return {
        title: 'Calendar unavailable',
        text: customerMessage(error),
      }
    }
  }
  return { title: "That didn't work", text: customerMessage(error) }
}

function Notice({
  problem,
  live = 'assertive',
}: {
  problem: Problem
  live?: 'assertive' | 'polite'
}) {
  return (
    <Alert role={live === 'polite' ? 'status' : 'alert'} data-testid="problem">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{problem.title}</AlertTitle>
      <AlertDescription>{problem.text}</AlertDescription>
    </Alert>
  )
}

function Meta({
  icon: Icon,
  children,
  muted,
}: {
  icon: typeof Clock
  children: React.ReactNode
  muted?: boolean
}) {
  return (
    <div
      className={`mt-2 flex items-start gap-2 text-sm ${muted ? 'text-muted-foreground' : ''}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[420px] rounded-[14px] border bg-card p-6 text-card-foreground">
      {children}
    </div>
  )
}

export function ManageBooking({
  host,
  publishableKey,
  token,
}: {
  host: string
  publishableKey: string
  token: string
}) {
  const client = useMemo(
    () => createClient({ host, publishableKey }),
    [host, publishableKey],
  )
  const [summary, setSummary] = useState<ManageSummary | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [missing, setMissing] = useState(false)
  const [view, setView] = useState<View>('view')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [moved, setMoved] = useState(false)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [picked, setPicked] = useState<SelectedSlot | null>(null)
  const [tz, setTz] = useState<string | null>(null)
  const [pickerKey, setPickerKey] = useState(0)
  // When the page opened; a booking that has started cannot be changed.
  const [now] = useState(() => Date.now())
  const headingRef = useRef<HTMLHeadingElement>(null)
  const lastKey = useRef<string | null>(null)

  const failed = useCallback((error: unknown) => {
    if (isOpenSlotsError(error) && error.code === 'not_found') {
      setMissing(true)
    } else {
      setLoadError(error)
    }
  }, [])

  const load = useCallback(
    () => client.getBooking(token).then(setSummary, failed),
    [client, token, failed],
  )

  useEffect(() => {
    const controller = new AbortController()
    client
      .getBooking(token, { signal: controller.signal })
      .then(setSummary, (error) => {
        if (!controller.signal.aborted) failed(error)
      })
    return () => controller.abort()
  }, [client, token, failed])

  // Move focus to the heading when the view or the booking's state changes
  // (so a screen reader hears the new content), but not when the booking
  // first loads.
  const shownKey = summary ? `${view}|${summary.status}` : null
  useEffect(() => {
    if (shownKey === null) return
    if (lastKey.current === null) {
      lastKey.current = shownKey
      return
    }
    if (lastKey.current !== shownKey) {
      lastKey.current = shownKey
      headingRef.current?.focus()
    }
  }, [shownKey])

  if (missing) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold tracking-tight">
          We can&apos;t find that booking
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The link may be incomplete or no longer valid. Use the link from your
          confirmation, or contact the business.
        </p>
      </Shell>
    )
  }

  if (!summary) {
    return (
      <Shell>
        {loadError ? (
          <div className="grid gap-3">
            <Notice problem={problemFor(loadError)} />
            <Button
              variant="outline"
              onClick={() => {
                setLoadError(null)
                void load()
              }}
            >
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </div>
        ) : (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading your booking…
          </p>
        )}
      </Shell>
    )
  }

  const zone = tz ?? summary.timezone
  const differs = summary.business.timezone !== summary.timezone
  const isPast = Date.parse(summary.start) <= now
  const cancelled = summary.status === 'cancelled'
  const changeable = summary.status === 'confirmed' && !isPast
  const badge: { status: Status; label?: string } = cancelled
    ? { status: 'cancelled' }
    : summary.status === 'pending'
      ? { status: 'pending' }
      : isPast
        ? { status: 'closed', label: 'Past' }
        : { status: 'confirmed' }
  const headline = `${summary.service.name} with ${summary.business.name}`

  async function cancel() {
    setBusy(true)
    setProblem(null)
    try {
      setSummary(await client.cancelBooking(token))
      setMoved(false)
      setCancelOpen(false)
    } catch (error) {
      setCancelOpen(false)
      setProblem(problemFor(error))
      // The booking may have changed elsewhere; show what is true now.
      void load()
    } finally {
      setBusy(false)
    }
  }

  async function confirmMove() {
    if (!picked) return
    setBusy(true)
    setProblem(null)
    try {
      setSummary(await client.rescheduleBooking(token, { start: picked.start }))
      setMoved(true)
      setPicked(null)
      setView('view')
    } catch (error) {
      setProblem(problemFor(error))
      if (isOpenSlotsError(error)) {
        const custom = hasCustomMessage(error)
        if (error.code === 'booking_not_changeable' && !custom) {
          // Cancelled elsewhere, or already past: show what is true now.
          void load()
          setView('view')
        } else if (
          (error.code === 'slot_taken' && !custom) ||
          (error.code === 'booking_not_changeable' && custom)
        ) {
          // Taken meanwhile, or overlapping the current booking: choose
          // again, from freshly loaded times.
          setPicked(null)
          setPickerKey((n) => n + 1)
          setView('pick')
        }
        // Anything else ("try again in a moment", calendar unavailable,
        // offline) stays on the confirmation so it can be retried.
      }
    } finally {
      setBusy(false)
    }
  }

  const when = (
    <>
      <Meta icon={CalendarDays}>
        {formatLongDate(summary.start, summary.timezone)}
      </Meta>
      <Meta icon={Clock}>
        <span className="font-mono">
          {formatTimeSpan(summary.start, summary.end, summary.timezone)}
        </span>{' '}
        {zoneName(summary.start, summary.timezone)}
        {differs ? (
          <span className="block text-xs text-muted-foreground">
            <span className="font-mono">
              {formatTimeSpan(
                summary.start,
                summary.end,
                summary.business.timezone,
              )}
            </span>{' '}
            {zoneName(summary.start, summary.business.timezone)} at the business
          </span>
        ) : null}
      </Meta>
    </>
  )

  if (view === 'pick' || view === 'confirm') {
    const end = picked
      ? (picked.end ?? addMinutes(picked.start, summary.service.durationMin))
      : null
    return (
      <div className="grid gap-4">
        <div className="rounded-[14px] border bg-card p-5 text-card-foreground">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold tracking-tight focus-visible:outline-none"
          >
            {view === 'pick' ? 'Choose a new time' : 'Confirm your new time'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{headline}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Currently{' '}
            <span className="font-medium text-foreground">
              {formatLongDate(summary.start, summary.timezone)},{' '}
              <span className="font-mono">
                {formatTimeSpan(summary.start, summary.end, summary.timezone)}
              </span>
            </span>
            , {zoneName(summary.start, summary.timezone)}.
          </p>
          {problem ? (
            <div className="mt-3">
              <Notice problem={problem} />
            </div>
          ) : null}
        </div>

        {view === 'pick' ? (
          <>
            <SlotPicker
              key={pickerKey}
              host={host}
              publishableKey={publishableKey}
              service={{
                id: summary.service.id,
                durationMin: summary.service.durationMin,
              }}
              timezone={zone}
              onTimezoneChange={setTz}
              value={picked?.start ?? null}
              onChange={(slot) => {
                setPicked(slot)
                if (slot) setProblem(null)
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setProblem(null)
                  setPicked(null)
                  setView('view')
                }}
              >
                Keep current time
              </Button>
              <Button
                className={KEY_CTA}
                disabled={!picked}
                onClick={() => {
                  setProblem(null)
                  setView('confirm')
                }}
              >
                Continue
              </Button>
            </div>
          </>
        ) : picked && end ? (
          <div className="rounded-[14px] border bg-card p-5 text-card-foreground">
            <p className="text-sm text-muted-foreground">New time</p>
            <Meta icon={CalendarDays}>
              <span className="font-semibold">
                {formatLongDate(picked.start, zone)}
              </span>
            </Meta>
            <Meta icon={Clock}>
              <span className="font-mono font-semibold">
                {formatTimeSpan(picked.start, end, zone)}
              </span>{' '}
              {zoneName(picked.start, zone)}
            </Meta>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                className={KEY_CTA}
                disabled={busy}
                onClick={() => void confirmMove()}
              >
                {busy ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : null}
                Confirm new time
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setProblem(null)
                  setView('pick')
                }}
              >
                Back
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <Shell>
      <StatusBadge status={badge.status} label={badge.label} />
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-2.5 text-base font-semibold focus-visible:outline-none"
      >
        {headline}
      </h1>
      {when}
      <Meta icon={Globe} muted>
        Times shown in {zoneName(summary.start, summary.timezone)}
      </Meta>

      {moved ? (
        <div className="mt-4">
          <Alert role="status">
            <CalendarDays aria-hidden="true" />
            <AlertTitle>Your booking has moved</AlertTitle>
            <AlertDescription>
              The new time is shown above. Your calendar invitation will follow
              it.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      {problem ? (
        <div className="mt-4">
          <Notice problem={problem} />
        </div>
      ) : null}

      {changeable ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setProblem(null)
              setMoved(false)
              setView('pick')
            }}
          >
            Reschedule
          </Button>
          <Button
            ref={cancelButton}
            variant="outline"
            disabled={busy}
            onClick={() => setCancelOpen(true)}
          >
            Cancel booking
          </Button>
        </div>
      ) : null}

      {cancelled ? (
        <div className="mt-4 grid gap-3">
          <Alert role="status">
            <CalendarPlus aria-hidden="true" />
            <AlertTitle>This booking is cancelled</AlertTitle>
            <AlertDescription>
              You can book another time whenever you like.
            </AlertDescription>
          </Alert>
          <Button asChild>
            <a href={`/b/${summary.business.slug}`}>Book again</a>
          </Button>
        </div>
      ) : null}

      {!changeable && !cancelled ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {isPast
            ? "This booking has already taken place, so it can't be changed."
            : "This booking can't be changed online right now."}
        </p>
      ) : null}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent
          // The dialog is opened from state, not from a trigger, so put the
          // keyboard focus back on the button it came from. After a
          // cancellation that button is gone and the result heading takes it.
          onCloseAutoFocus={(event) => {
            if (cancelButton.current) {
              event.preventDefault()
              cancelButton.current.focus()
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {headline} on {formatLongDate(summary.start, summary.timezone)} at{' '}
              {formatTimeSpan(summary.start, summary.end, summary.timezone)}{' '}
              {zoneName(summary.start, summary.timezone)} will be cancelled and
              removed from the calendar. You can book again afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                void cancel()
              }}
            >
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : null}
              Yes, cancel booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  )
}
