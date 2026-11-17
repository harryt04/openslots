'use client'

import type { ServiceColor } from '@openslots/core'
import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useWatch, type Control } from 'react-hook-form'

import type { EditorSchedule } from '@/components/custom/service-form'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SERVICE_COLOR_CLASS } from '@/lib/services/colors'
import {
  computePreview,
  formatClock,
  formatClockShort,
  formatPreviewDate,
  minuteOfDay,
} from '@/lib/services/preview'
import type { ServiceFormValues } from '@/lib/services/schema'
import { cn } from '@/lib/utils'

/**
 * Vertical scale of the day timeline. A little taller than the spec's 270px
 * for nine hours, so a 30 min block still holds its label.
 */
const PX_PER_MIN = 0.6

/**
 * The S4 live preview. Every start shown comes from `computeSlots` in
 * `@openslots/core`, called with the form's current values; this component
 * only draws what the engine returned.
 *
 * Offered starts can overlap (a 180 min service starting hourly), and
 * overlapping blocks cannot all be drawn, so every start is listed as a
 * chip and marked on the time axis, and one chosen start is drawn as a
 * block with its buffers.
 */
export function ServicePreview({
  control,
  schedules,
  now,
}: {
  control: Control<ServiceFormValues>
  schedules: EditorSchedule[]
  now: string
}) {
  const values = useWatch({ control }) as Partial<ServiceFormValues>
  const [showExample, setShowExample] = useState(true)
  const [chosen, setChosen] = useState<string | null>(null)
  const schedule = schedules.find((s) => s.id === values.scheduleId)

  const preview = useMemo(
    () =>
      schedule
        ? computePreview({
            values,
            schedule,
            now: new Date(now),
            showExample,
          })
        : null,
    [values, schedule, now, showExample],
  )

  return (
    <Card className="gap-0 p-5" data-testid="service-preview">
      {!schedule || !preview ? (
        <PreviewMessage title="Preview">
          Choose a schedule to see the start times this service would offer.
        </PreviewMessage>
      ) : preview.kind === 'invalid' ? (
        <PreviewMessage title="Preview">
          Fix the highlighted fields to see the start times.
        </PreviewMessage>
      ) : preview.kind === 'closed' ? (
        <PreviewMessage title="Preview">
          {schedule.name} has no open days in the next year. Add opening hours
          on the Availability page.
        </PreviewMessage>
      ) : (
        <DayPreview
          preview={preview}
          schedule={schedule}
          color={values.color ?? 'blue'}
          showExample={showExample}
          onShowExample={setShowExample}
          chosen={chosen}
          onChoose={setChosen}
        />
      )}
    </Card>
  )
}

function PreviewMessage({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <>
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground" role="status">
        {children}
      </p>
    </>
  )
}

type DayPreviewData = Extract<
  ReturnType<typeof computePreview>,
  { kind: 'day' }
>

function DayPreview({
  preview,
  schedule,
  color,
  showExample,
  onShowExample,
  chosen,
  onChoose,
}: {
  preview: DayPreviewData
  schedule: EditorSchedule
  color: ServiceColor
  showExample: boolean
  onShowExample: (v: boolean) => void
  chosen: string | null
  onChoose: (iso: string | null) => void
}) {
  const { rules, ranges, example, starts, date } = preview
  const tz = schedule.timezone
  const startMins = starts.map((iso) => minuteOfDay(iso, tz))
  // Keep the owner's chosen start while it is still offered; else the first.
  const selectedIndex = Math.max(0, chosen ? starts.indexOf(chosen) : 0)
  const selectedIso = starts[selectedIndex] ?? null
  const selected = selectedIso === null ? null : startMins[selectedIndex]!

  const hours = ranges
    .map(
      (r) => `${formatClockShort(r.startMin)} to ${formatClockShort(r.endMin)}`,
    )
    .join(' and ')

  // Timeline bounds: the open hours, widened to fit the drawn buffers.
  const lo = Math.min(
    ...ranges.map((r) => r.startMin),
    selected === null ? Infinity : selected - rules.bufferBeforeMin,
  )
  const hi = Math.max(
    ...ranges.map((r) => r.endMin),
    selected === null
      ? -Infinity
      : selected + rules.durationMin + rules.bufferAfterMin,
  )
  const top = Math.floor(lo / 60) * 60
  const bottom = Math.ceil(hi / 60) * 60
  const span = bottom - top
  const step = span <= 360 ? 60 : span <= 720 ? 120 : 180
  const y = (min: number) => (min - top) * PX_PER_MIN
  const labels: number[] = []
  for (let m = top; m <= bottom; m += step) labels.push(m)

  const exampleId = `example-busy-${schedule.id}`

  return (
    <>
      <h2 className="font-semibold">Preview: {formatPreviewDate(date)}</h2>
      <p className="text-xs text-muted-foreground">
        {schedule.name}: open {hours}. Times in{' '}
        <span className="font-mono">{tz}</span>.
      </p>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-dashed border-input px-3 py-2">
        <label htmlFor={exampleId} className="text-xs">
          <span className="font-medium">Example busy hour</span>
          <span className="block text-muted-foreground">
            Not a real event. Google busy times appear here once a calendar is
            connected.
          </span>
        </label>
        <Switch
          id={exampleId}
          checked={showExample}
          onCheckedChange={onShowExample}
        />
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium" id="preview-starts-label">
          {starts.length === 0
            ? 'No start times on this day'
            : starts.length === 1
              ? '1 start time offered'
              : `${starts.length} start times offered`}
        </p>
        {starts.length > 0 ? (
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={1}
            aria-labelledby="preview-starts-label"
            className="mt-2 flex-wrap"
            value={selectedIso ?? ''}
            onValueChange={(v) => v && onChoose(v)}
          >
            {starts.map((iso, i) => (
              <ToggleGroupItem
                key={iso}
                value={iso}
                aria-label={`Show ${formatClock(startMins[i]!)}`}
                className="h-7 rounded-full px-2.5 font-mono text-xs data-[spacing=1]:rounded-full data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {i === selectedIndex ? <Check aria-hidden="true" /> : null}
                {formatClock(startMins[i]!)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {preview.beyondWindow
              ? `This day is more than ${rules.windowDays} days ahead, beyond the booking window.`
              : 'The service and its buffers do not fit in the open hours on this day.'}
          </p>
        )}
      </div>

      <div
        className="relative mt-5 ml-14 border-l border-border"
        style={{ height: span * PX_PER_MIN }}
        aria-hidden="true"
        data-testid="preview-timeline"
      >
        {labels.map((m) => (
          <div
            key={m}
            className="absolute -left-14 w-12 -translate-y-1/2 text-right font-mono text-[11px] text-muted-foreground"
            style={{ top: y(m) }}
          >
            {formatClockShort(m)}
          </div>
        ))}
        {/* Open hours: a solid bar on the axis. */}
        {ranges.map((r) => (
          <div
            key={`${r.startMin}-${r.endMin}`}
            className="absolute -left-[3px] w-[5px] rounded-full bg-primary"
            style={{
              top: y(r.startMin),
              height: (r.endMin - r.startMin) * PX_PER_MIN,
            }}
          />
        ))}
        {/* Every offered start: a tick on the axis. */}
        {startMins.map((m, i) => (
          <div
            key={m}
            className={cn(
              'absolute left-0 h-px bg-foreground',
              i === selectedIndex ? 'w-3' : 'w-1.5',
            )}
            style={{ top: y(m) }}
          />
        ))}
        {example ? (
          <div
            className="absolute right-0 left-2 rounded-md border border-dashed border-muted-foreground bg-muted px-2 py-1 text-[11.5px] text-muted-foreground"
            style={{
              top: y(example.startMin),
              height: (example.endMin - example.startMin) * PX_PER_MIN,
            }}
          >
            Example busy
          </div>
        ) : null}
        {selected !== null ? (
          <>
            {rules.bufferBeforeMin > 0 ? (
              <div
                className="absolute right-0 left-2 rounded-t-sm bg-hatch"
                style={{
                  top: y(selected - rules.bufferBeforeMin),
                  height: rules.bufferBeforeMin * PX_PER_MIN,
                }}
              />
            ) : null}
            <div
              data-testid="preview-block"
              className={cn(
                'absolute right-0 left-2 rounded-md',
                SERVICE_COLOR_CLASS[color],
              )}
              style={{
                top: y(selected),
                height: rules.durationMin * PX_PER_MIN,
              }}
            />
            {/*
              The label sits on a card-colored pill rather than on the service
              color, so it meets AA on every color (dark text on the blue
              service color would not), and it may overhang a short block.
            */}
            <span
              className="absolute left-3.5 z-10 rounded-sm border bg-card px-1.5 py-0.5 font-mono text-[11px] leading-none font-semibold text-foreground"
              style={{ top: y(selected) + 2 }}
            >
              {formatClock(selected)} · {rules.durationMin}m
            </span>
            {rules.bufferAfterMin > 0 ? (
              <div
                className="absolute right-0 left-2 rounded-b-sm bg-hatch"
                style={{
                  top: y(selected + rules.durationMin),
                  height: rules.bufferAfterMin * PX_PER_MIN,
                }}
              />
            ) : null}
          </>
        ) : null}
      </div>

      <p
        className="mt-4 text-xs text-muted-foreground"
        data-testid="preview-note"
      >
        {previewNote(preview, selected)}
      </p>
    </>
  )
}

/** The explanation under the timeline, from what the engine returned. */
function previewNote(preview: DayPreviewData, selected: number | null): string {
  const { rules, example, starts } = preview
  const parts: string[] = []
  if (selected !== null) {
    parts.push(
      `The block shows the ${formatClock(selected)} start; choose another time above to draw it.`,
    )
  }
  const buffers = [
    rules.bufferBeforeMin > 0 ? `${rules.bufferBeforeMin} min before` : null,
    rules.bufferAfterMin > 0 ? `${rules.bufferAfterMin} min after` : null,
  ].filter(Boolean)
  if (buffers.length) {
    parts.push(`Hatched strips are the buffer (${buffers.join(', ')}).`)
  }
  parts.push(
    'Ticks on the axis mark every offered start; the bar is open hours.',
  )
  if (example) {
    parts.push(
      'Starts whose service or buffer would overlap the example busy hour are not offered.',
    )
  }
  const occupiedMs =
    (rules.bufferBeforeMin + rules.durationMin + rules.bufferAfterMin) * 60_000
  const overlapping = starts.some(
    (iso, i) =>
      i > 0 && Date.parse(iso) - Date.parse(starts[i - 1]!) < occupiedMs,
  )
  if (overlapping) {
    parts.push(
      'Offered starts overlap: once a customer books one, the others it overlaps are no longer offered.',
    )
  }
  return parts.join(' ')
}
