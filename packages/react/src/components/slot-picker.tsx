'use client'

import type { PublicService } from '@openslots/core'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { customerMessage } from '../errors'
import { connectionKey, useBusiness, useSlots, type Connection } from '../hooks'
import {
  addDays,
  addMonths,
  addMonthsToDate,
  daysInMonth,
  detectTimeZone,
  firstOfMonth,
  formatDateLong,
  formatDateShort,
  formatMonth,
  lastOfMonth,
  listTimeZones,
  localDateOf,
  monthOf,
  slotLabels,
  timeZoneLabel,
  todayIn,
  weekday,
  weekdayLong,
  weekdayShort,
  lastWindowMonth,
} from '../time'
import { Icon } from './icons'
import { cx, Root, type Theme } from './root'
import { button, Loading, Notice, VisuallyHidden } from './ui'

/** A chosen slot, as `SlotPicker` reports it. */
export interface SelectedSlot {
  /** UTC ISO instant. */
  start: string
  /** `start` plus the service duration, when the duration is known. */
  end: string | null
  /** The calendar date of `start` in `timezone`. */
  date: string
  /** The customer timezone the slot was chosen in. */
  timezone: string
}

/** How many empty months to skip forward on first load before stopping. */
const AUTO_ADVANCE_MONTHS = 2
/** How far ahead the month buttons go when the service has no window. */
const MAX_MONTHS_AHEAD = 24

/**
 * The customer's timezone: the prop if given, else detected after mount.
 * The customer can change it; a later change of the prop replaces it.
 */
export function useCustomerTimeZone(prop?: string) {
  const [timezone, setTimezone] = useState<string | null>(prop ?? null)
  const [lastProp, setLastProp] = useState(prop)
  if (prop !== lastProp) {
    setLastProp(prop)
    if (prop) setTimezone(prop)
  }
  useEffect(() => {
    // Detected on the client only, so server rendering stays deterministic.
    if (!prop) setTimezone((tz) => tz ?? detectTimeZone())
  }, [prop])
  return [timezone, setTimezone] as const
}

function maxOf(a: string, b: string): string {
  return a > b ? a : b
}

export function endOf(start: string, durationMin: number | undefined) {
  return durationMin === undefined
    ? null
    : new Date(Date.parse(start) + durationMin * 60_000).toISOString()
}

// -------------------------------------------------------------- timezone

export function TimezoneField({
  value,
  onChange,
  businessTimezone,
}: {
  value: string
  onChange: (timezone: string) => void
  businessTimezone?: string
}) {
  const id = useId()
  const zones = useMemo(
    () =>
      listTimeZones([value, ...(businessTimezone ? [businessTimezone] : [])]),
    [value, businessTimezone],
  )
  const differs = businessTimezone !== undefined && businessTimezone !== value
  return (
    <div className="os:grid os:gap-1">
      <label
        htmlFor={id}
        className="os:flex os:items-center os:gap-2 os:text-sm os:text-muted-foreground"
      >
        <Icon name="globe" />
        <span>Times shown in</span>
      </label>
      <div className="os:relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="os:block os:w-full os:min-h-[38px] os:rounded-md os:border os:border-input os:bg-card os:pl-2.5 os:pr-8 os:text-sm os:text-foreground"
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone === value || zone === businessTimezone
                ? `${timeZoneLabel(zone)} (${zone.replace(/_/g, ' ')})`
                : zone.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <span className="os:pointer-events-none os:absolute os:right-2.5 os:top-[11px] os:text-muted-foreground">
          <Icon name="chevronDown" />
        </span>
      </div>
      {differs ? (
        <p className="os:text-xs os:text-muted-foreground">
          The business is in {timeZoneLabel(businessTimezone)}.
        </p>
      ) : null}
    </div>
  )
}

// -------------------------------------------------------------- panels

export interface SlotPanelsProps {
  connection: Connection
  serviceId: string
  durationMin?: number
  /** The chosen start, a UTC ISO instant. */
  value: string | null
  onChange: (slot: SelectedSlot | null) => void
  /** The customer's timezone. */
  timezone: string
  /** The business timezone, where the booking window is counted. */
  businessTimezone?: string
  /**
   * The service's booking window in days after today (business timezone).
   * The month buttons stop at the month it ends in; without it, 24 months.
   */
  windowDays?: number
  /** The day to show first when no slot is chosen. */
  initialDate?: string | null
  /** Called when the customer picks a day. */
  onDateChange?: (date: string) => void
  /** Changing this number reloads the times (after `slot_taken`). */
  reloadToken?: number
  /** A message above the times, for example why the customer is back here. */
  notice?: ReactNode
  /** Rendered under the times, for example a Continue button. */
  footer?: ReactNode
  /** Extra content under the calendar, for example the timezone field. */
  calendarFooter?: ReactNode
  calendarClassName?: string
  timesClassName?: string
}

interface Cell {
  date: string
  count: number
  available: boolean
}

/**
 * The calendar month grid and the times for the chosen day, as two sibling
 * panels so the caller places them in its own grid.
 */
export function SlotPanels({
  connection,
  serviceId,
  durationMin,
  value,
  onChange,
  timezone,
  businessTimezone,
  windowDays,
  initialDate,
  onDateChange,
  reloadToken = 0,
  notice,
  footer,
  calendarFooter,
  calendarClassName,
  timesClassName,
}: SlotPanelsProps) {
  const ids = useId()
  const monthLabelId = `${ids}-month`
  const timesHeadingId = `${ids}-times`

  // The clock, read once after mount (no clock reads while server
  // rendering); today follows the timezone.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
  }, [])
  const today = now ? todayIn(timezone, now) : null

  const valueDate = value ? localDateOf(new Date(value), timezone) : null
  const [month, setMonth] = useState<string | null>(null)
  const startDate = valueDate ?? initialDate ?? null
  const [selectedDate, setSelectedDate] = useState<string | null>(startDate)
  const [focusDate, setFocusDate] = useState<string | null>(null)
  const autoAdvance = useRef(AUTO_ADVANCE_MONTHS)
  const pendingFocus = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)

  // First month: the chosen slot's, else this month.
  useEffect(() => {
    if (month === null && today) setMonth(monthOf(startDate ?? today))
  }, [month, today, startDate])

  // A new service starts over.
  useEffect(() => {
    autoAdvance.current = AUTO_ADVANCE_MONTHS
  }, [serviceId])

  // Keep the chosen day in step with the value and the timezone.
  useEffect(() => {
    if (valueDate) {
      setSelectedDate(valueDate)
      setMonth((m) =>
        m === null || m === monthOf(valueDate) ? m : monthOf(valueDate),
      )
    }
  }, [valueDate])

  const slots = useSlots({
    ...connection,
    service: month ? serviceId : null,
    from: month ? firstOfMonth(month) : null,
    to: month ? lastOfMonth(month) : null,
    timezone,
  } as Parameters<typeof useSlots>[0])

  const { refetch } = slots
  const firstReload = useRef(reloadToken)
  useEffect(() => {
    if (reloadToken !== firstReload.current) refetch()
  }, [reloadToken, refetch])

  const days = useMemo(() => slots.data?.days ?? {}, [slots.data])
  const unavailable = slots.data?.reason === 'calendar_unavailable'
  const loaded = slots.data !== undefined && !slots.loading
  const emptyMonth = loaded && !unavailable && Object.keys(days).length === 0

  const minMonth = today ? monthOf(today) : null
  const maxMonth = !minMonth
    ? null
    : windowDays !== undefined && now
      ? maxOf(
          minMonth,
          lastWindowMonth(businessTimezone ?? timezone, windowDays, now),
        )
      : addMonths(minMonth, MAX_MONTHS_AHEAD)
  const canPrev = !!month && !!minMonth && month > minMonth
  const canNext = !!month && !!maxMonth && month < maxMonth

  // On first load, step past empty months (up to two) to the first openings.
  const advancing =
    emptyMonth && autoAdvance.current > 0 && !startDate && canNext
  useEffect(() => {
    if (advancing && month) {
      autoAdvance.current -= 1
      setMonth(addMonths(month, 1))
    } else if (loaded) {
      autoAdvance.current = 0
    }
  }, [advancing, loaded, month])

  // For tests and hosts: whether the grid shows this month's final answer.
  const gridState =
    slots.error && !slots.loading
      ? 'error'
      : !loaded || advancing
        ? 'loading'
        : unavailable
          ? 'unavailable'
          : 'ready'

  const cells: Cell[] = useMemo(() => {
    if (!month) return []
    const n = daysInMonth(month)
    return Array.from({ length: n }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`
      const count = unavailable ? 0 : (days[date]?.length ?? 0)
      return { date, count, available: count > 0 }
    })
  }, [month, days, unavailable])

  const firstAvailable = cells.find((c) => c.available)?.date
  const inMonth = (d: string | null | undefined): d is string =>
    !!d && !!month && monthOf(d) === month
  const rovingDate = inMonth(focusDate)
    ? focusDate
    : inMonth(selectedDate)
      ? selectedDate
      : (firstAvailable ??
        (inMonth(today) ? today : month ? firstOfMonth(month) : null))

  useEffect(() => {
    if (!pendingFocus.current || !rovingDate) return
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-date="${rovingDate}"]`,
    )
    if (el) {
      el.focus()
      pendingFocus.current = false
    }
  })

  function goToMonth(next: string) {
    autoAdvance.current = 0
    setMonth(next)
  }

  function moveFocus(target: string) {
    const lowest = minMonth ? firstOfMonth(minMonth) : target
    const highest = maxMonth ? lastOfMonth(maxMonth) : target
    const clamped =
      target < lowest ? lowest : target > highest ? highest : target
    if (month && monthOf(clamped) !== month) goToMonth(monthOf(clamped))
    setFocusDate(clamped)
    pendingFocus.current = true
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-date]',
    )?.dataset.date
    if (!current) return
    const dow = weekday(current)
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(current, -1),
      ArrowRight: () => addDays(current, 1),
      ArrowUp: () => addDays(current, -7),
      ArrowDown: () => addDays(current, 7),
      Home: () => addDays(current, -dow),
      End: () => addDays(current, 6 - dow),
      PageUp: () => addMonthsToDate(current, event.shiftKey ? -12 : -1),
      PageDown: () => addMonthsToDate(current, event.shiftKey ? 12 : 1),
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    moveFocus(move())
  }

  function pickDay(cell: Cell) {
    setFocusDate(cell.date)
    if (!cell.available) return
    setSelectedDate(cell.date)
    onDateChange?.(cell.date)
    if (value && valueDate !== cell.date) onChange(null)
  }

  function pickTime(start: string) {
    onChange({
      start,
      end: endOf(start, durationMin),
      date: localDateOf(new Date(start), timezone),
      timezone,
    })
  }

  const weeks: (Cell | null)[][] = useMemo(() => {
    if (!month) return []
    const lead = weekday(firstOfMonth(month))
    const all: (Cell | null)[] = [...Array<null>(lead).fill(null), ...cells]
    while (all.length % 7) all.push(null)
    return Array.from({ length: all.length / 7 }, (_, i) =>
      all.slice(i * 7, i * 7 + 7),
    )
  }, [month, cells])

  const times = useMemo(
    () => (selectedDate && !unavailable ? (days[selectedDate] ?? []) : []),
    [selectedDate, unavailable, days],
  )
  const labels = useMemo(() => slotLabels(times, timezone), [times, timezone])

  const calendar = (
    <div className={calendarClassName}>
      <div className="os:flex os:items-center os:justify-between os:mb-2.5 os:gap-2">
        <h3 id={monthLabelId} className="os:font-semibold" aria-live="polite">
          {month ? formatMonth(month) : ' '}
        </h3>
        <div className="os:flex os:gap-1">
          <button
            type="button"
            className={cx(button.outline, button.icon)}
            aria-label="Previous month"
            disabled={!canPrev}
            onClick={() => month && goToMonth(addMonths(month, -1))}
          >
            <Icon name="chevronLeft" />
          </button>
          <button
            type="button"
            className={cx(button.outline, button.icon)}
            aria-label="Next month"
            disabled={!canNext}
            onClick={() => month && goToMonth(addMonths(month, 1))}
          >
            <Icon name="chevronRight" />
          </button>
        </div>
      </div>

      {month ? (
        <div
          ref={gridRef}
          role="grid"
          aria-labelledby={monthLabelId}
          aria-busy={slots.loading || undefined}
          data-month={month}
          data-state={gridState}
          onKeyDown={onGridKeyDown}
          className="os:grid os:gap-1"
        >
          <div role="row" className="os:grid os:grid-cols-7 os:gap-1">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <div
                key={d}
                role="columnheader"
                className="os:text-center os:text-[11px] os:font-medium os:text-muted-foreground os:py-1"
              >
                <span aria-hidden="true">{weekdayShort(d)}</span>
                <VisuallyHidden>{weekdayLong(d)}</VisuallyHidden>
              </div>
            ))}
          </div>
          {weeks.map((week, w) => (
            <div key={w} role="row" className="os:grid os:grid-cols-7 os:gap-1">
              {week.map((cell, i) =>
                cell ? (
                  <DayCell
                    key={cell.date}
                    cell={cell}
                    selected={cell.date === selectedDate}
                    today={cell.date === today}
                    tabbable={cell.date === rovingDate}
                    loading={slots.loading && !slots.data}
                    onPick={pickDay}
                  />
                ) : (
                  <div key={`blank-${i}`} role="gridcell" />
                ),
              )}
            </div>
          ))}
        </div>
      ) : (
        <Loading label="Loading calendar…" />
      )}

      <div className="os:mt-3 os:grid os:gap-3">
        {slots.loading ? <Loading label="Loading open times…" /> : null}
        {unavailable ? (
          <Notice tone="warning">
            Online booking is paused because the business&apos;s calendar needs
            attention, so no times can be shown right now. Please try again
            later.
          </Notice>
        ) : null}
        {slots.error && !slots.loading ? (
          <Notice
            tone="error"
            action={
              <button
                type="button"
                className={button.outline}
                onClick={refetch}
              >
                <Icon name="refresh" />
                Try again
              </button>
            }
          >
            {customerMessage(slots.error)}
          </Notice>
        ) : null}
        {emptyMonth && !advancing && month ? (
          <Notice
            tone="info"
            action={
              canNext ? (
                <button
                  type="button"
                  className={button.outline}
                  onClick={() => goToMonth(addMonths(month, 1))}
                >
                  Next month
                  <Icon name="chevronRight" />
                </button>
              ) : null
            }
          >
            No open times in {formatMonth(month)}.
          </Notice>
        ) : null}
        {calendarFooter}
      </div>
    </div>
  )

  const timesPanel = (
    <div className={timesClassName}>
      {notice ? <div className="os:mb-3">{notice}</div> : null}
      {selectedDate && !unavailable ? (
        <>
          <h3 id={timesHeadingId} className="os:font-semibold os:mb-2.5">
            {formatDateShort(selectedDate)}{' '}
            <span className="os:text-xs os:font-normal os:text-muted-foreground">
              {slots.loading && !slots.data
                ? 'loading'
                : `${times.length} open`}
            </span>
          </h3>
          {times.length ? (
            <div
              role="group"
              aria-labelledby={timesHeadingId}
              className="os:grid os:gap-1.5 os:p-0.5 os:grid-cols-[repeat(auto-fill,minmax(96px,1fr))] os:@min-[760px]:grid-cols-1 os:@min-[760px]:max-h-[300px] os:@min-[760px]:overflow-y-auto"
            >
              {times.map((start, i) => {
                const chosen = start === value
                const label = labels[i]!
                return (
                  <button
                    key={start}
                    type="button"
                    aria-pressed={chosen}
                    aria-label={`${label}, ${formatDateLong(selectedDate)}`}
                    onClick={() => pickTime(start)}
                    className={cx(
                      'os:inline-flex os:items-center os:justify-center os:gap-1.5 os:min-h-[38px] os:rounded-md os:border os:font-mono os:text-sm os:font-semibold os:transition-colors',
                      chosen
                        ? 'os:bg-accent os:border-accent os:text-accent-foreground'
                        : 'os:bg-card os:border-primary os:text-primary os:hover:bg-primary-soft',
                    )}
                  >
                    {chosen ? <Icon name="check" size={14} /> : null}
                    {label}
                  </button>
                )
              })}
            </div>
          ) : slots.loading ? null : (
            <p className="os:text-sm os:text-muted-foreground">
              No open times left on this day. Please pick another day.
            </p>
          )}
        </>
      ) : unavailable ? null : (
        <p className="os:text-sm os:text-muted-foreground">
          Pick a highlighted day to see open times.
        </p>
      )}
      {footer}
    </div>
  )

  return (
    <>
      {calendar}
      {timesPanel}
    </>
  )
}

function DayCell({
  cell,
  selected,
  today,
  tabbable,
  loading,
  onPick,
}: {
  cell: Cell
  selected: boolean
  today: boolean
  tabbable: boolean
  loading: boolean
  onPick: (cell: Cell) => void
}) {
  const day = Number(cell.date.slice(8, 10))
  const label = `${formatDateLong(cell.date)}, ${
    loading
      ? 'loading'
      : cell.available
        ? `${cell.count} ${cell.count === 1 ? 'time' : 'times'} available`
        : 'no open times'
  }`
  return (
    <div role="gridcell" aria-selected={selected}>
      <button
        type="button"
        data-date={cell.date}
        tabIndex={tabbable ? 0 : -1}
        aria-label={label}
        aria-disabled={!cell.available || undefined}
        aria-current={today ? 'date' : undefined}
        onClick={() => onPick(cell)}
        className={cx(
          'os:relative os:flex os:flex-col os:items-center os:justify-center os:w-full os:aspect-square os:max-h-[46px] os:min-h-[38px] os:rounded-md os:text-sm',
          selected
            ? 'os:bg-primary os:text-primary-foreground os:font-semibold'
            : cell.available
              ? 'os:bg-primary-soft os:text-foreground os:font-semibold os:hover:outline-2 os:hover:outline-primary'
              : 'os:bg-transparent os:text-muted-foreground os:font-normal os:line-through os:opacity-60',
        )}
      >
        <span>{day}</span>
        {selected ? (
          // The chosen day is marked by shape as well as color (T-5).
          <span
            aria-hidden="true"
            className="os:absolute os:bottom-1 os:h-0.5 os:w-3 os:rounded-full os:bg-current"
          />
        ) : today ? (
          <span
            aria-hidden="true"
            className="os:absolute os:bottom-1 os:h-1 os:w-1 os:rounded-full os:bg-current"
          />
        ) : null}
      </button>
    </div>
  )
}

// -------------------------------------------------------------- export

export type SlotPickerProps = Connection & {
  /** The service: its id or slug, or the service object from `useBusiness`. */
  service: string | (Pick<PublicService, 'id'> & Partial<PublicService>)
  /**
   * The chosen start (UTC ISO instant), or null. Passing the prop (even
   * `null`) makes the picker controlled: it shows exactly this value and
   * reports choices through `onChange`. Omit it to let the picker keep its
   * own selection. Either way, a change of service, `host`,
   * `publishableKey` or `client` clears the selection; a controlled picker
   * then ignores the old value and calls `onChange(null)` once.
   */
  value?: string | null
  /** Called with the chosen slot, or null when the choice is cleared. */
  onChange?: (slot: SelectedSlot | null) => void
  /**
   * The customer's timezone. Detected from the device when not given. A
   * later change of the prop is applied (the chosen time is kept and shown
   * in the new zone); the customer can still pick another zone in the
   * dropdown, which `onTimezoneChange` reports.
   */
  timezone?: string
  /** Called when the customer picks another timezone. */
  onTimezoneChange?: (timezone: string) => void
  theme?: Theme
  className?: string
}

/**
 * Only the calendar and the times, for apps with their own form (C1). The
 * value is controlled when `value` is passed, else kept internally (see
 * `SlotPickerProps.value`).
 */
export function SlotPicker({
  service,
  value,
  onChange,
  timezone: timezoneProp,
  onTimezoneChange,
  theme,
  className,
  ...connection
}: SlotPickerProps) {
  const business = useBusiness(connection as Connection)
  const [timezone, setTimezone] = useCustomerTimeZone(timezoneProp)
  const [internal, setInternal] = useState<string | null>(null)

  const wanted = typeof service === 'string' ? service : service.id
  const resolved = business.data?.services.find(
    (s) => s.id === wanted || s.slug === wanted,
  )
  const serviceId =
    resolved?.id ?? (typeof service === 'string' ? null : service.id)
  const durationMin =
    resolved?.durationMin ??
    (typeof service === 'string' ? undefined : service.durationMin)
  const windowDays =
    resolved?.windowDays ??
    (typeof service === 'string' ? undefined : service.windowDays)

  // What the selection belongs to. While a slug is still being resolved it
  // is null, and that is not a change.
  const identity = serviceId
    ? `${connectionKey(connection as Connection)}|${serviceId}`
    : null
  const [owner, setOwner] = useState(identity)
  // A controlled value that belonged to the previous service, ignored until
  // the parent passes another.
  const [stale, setStale] = useState<string | null>(null)
  const [clears, setClears] = useState(0)
  if (identity !== null && identity !== owner) {
    setOwner(identity)
    if (owner !== null) {
      setInternal(null)
      if (value) setStale(value)
      if (value || (value === undefined && internal)) setClears((n) => n + 1)
    }
  }
  if (stale !== null && value !== stale) setStale(null)
  const current =
    value === undefined ? internal : value === stale ? null : value

  // Tell a parent its selection was cleared (after render, not during).
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => {
    if (clears > 0) onChangeRef.current?.(null)
  }, [clears])

  const frame =
    'os:bg-card os:text-foreground os:border os:border-border os:rounded-xl os:overflow-hidden os:grid os:grid-cols-1 os:@min-[760px]:grid-cols-[minmax(0,1fr)_260px]'

  let body: ReactNode
  if (!timezone || (!serviceId && !business.data && !business.error)) {
    body = (
      <div className="os:p-5">
        <Loading />
      </div>
    )
  } else if (!serviceId) {
    body = (
      <div className="os:p-5">
        <Notice
          tone="error"
          action={
            business.error ? (
              <button
                type="button"
                className={button.outline}
                onClick={business.refetch}
              >
                <Icon name="refresh" />
                Try again
              </button>
            ) : null
          }
        >
          {business.error
            ? customerMessage(business.error)
            : 'This service is not available for booking.'}
        </Notice>
      </div>
    )
  } else {
    body = (
      <SlotPanels
        key={identity}
        connection={connection as Connection}
        serviceId={serviceId}
        durationMin={durationMin}
        windowDays={windowDays}
        businessTimezone={business.data?.timezone}
        value={current}
        onChange={(slot) => {
          setInternal(slot?.start ?? null)
          onChange?.(slot)
        }}
        timezone={timezone}
        calendarFooter={
          <TimezoneField
            value={timezone}
            businessTimezone={business.data?.timezone}
            onChange={(tz) => {
              setTimezone(tz)
              onTimezoneChange?.(tz)
            }}
          />
        }
        calendarClassName="os:p-5 os:border-b os:border-border os:@min-[760px]:border-b-0 os:@min-[760px]:border-r"
        timesClassName="os:p-5"
      />
    )
  }

  return (
    <Root theme={theme} className={className}>
      <div className={frame}>{body}</div>
    </Root>
  )
}
