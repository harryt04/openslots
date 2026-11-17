'use client'

import { Plus, TriangleAlert, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { nextRange, type RangeText } from '@/lib/schedules/draft'
import { formatTime, parseTime } from '@/lib/schedules/time'
import type { FieldErrors } from '@/lib/schedules/validate'
import { MAX_RANGES_PER_DAY } from '@openslots/core'

function TimeField({
  value,
  onChange,
  label,
  invalid,
  asEnd,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  invalid: boolean
  asEnd?: boolean
}) {
  return (
    <Input
      value={value}
      aria-label={label}
      aria-invalid={invalid || undefined}
      inputMode="text"
      autoComplete="off"
      spellCheck={false}
      className="w-[108px] font-mono"
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        // Tidy "9am" into "9:00 AM"; leave anything unreadable to show its error.
        const parsed = parseTime(value, asEnd)
        if (parsed.ok && formatTime(parsed.minutes) !== value)
          onChange(formatTime(parsed.minutes))
      }}
    />
  )
}

/**
 * One or more time ranges, each `[start] to [end]`, with add and remove, and
 * inline errors under the offending range. `prefix` is the error key of the
 * day, such as `weekly.3`, so errors found by the shared schema land here.
 */
export function RangeFields({
  ranges,
  onChange,
  label,
  errors,
  prefix,
  id,
}: {
  ranges: RangeText[]
  onChange: (ranges: RangeText[]) => void
  /** Names the fields for screen readers, e.g. `Thursday`. */
  label: string
  errors: FieldErrors
  prefix: string
  id: string
}) {
  const update = (i: number, patch: Partial<RangeText>) =>
    onChange(ranges.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const messages: { key: string; text: string }[] = []
  ranges.forEach((_, i) => {
    const text =
      errors[`${prefix}.${i}.startMin`] ?? errors[`${prefix}.${i}.endMin`]
    if (text)
      messages.push({
        key: `${prefix}.${i}`,
        text: ranges.length > 1 ? `Range ${i + 1}: ${text}` : text,
      })
  })
  const dayError = errors[prefix]
  if (dayError) messages.push({ key: prefix, text: dayError })

  return (
    <div className="flex min-w-0 flex-1 items-start gap-1">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {ranges.map((r, i) => {
            const startBad = Boolean(errors[`${prefix}.${i}.startMin`])
            const endBad =
              Boolean(errors[`${prefix}.${i}.endMin`]) || Boolean(dayError)
            const n = ranges.length > 1 ? ` range ${i + 1}` : ''
            return (
              <span key={i} className="flex items-center gap-1">
                <TimeField
                  value={r.start}
                  label={`${label}${n} start`}
                  invalid={startBad || Boolean(dayError)}
                  onChange={(v) => update(i, { start: v })}
                />
                <span className="text-muted-foreground">to</span>
                <TimeField
                  value={r.end}
                  label={`${label}${n} end`}
                  invalid={endBad}
                  asEnd
                  onChange={(v) => update(i, { end: v })}
                />
                {ranges.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${label} time range ${i + 1}`}
                    onClick={() => onChange(ranges.filter((_, j) => j !== i))}
                  >
                    <X aria-hidden="true" />
                  </Button>
                ) : null}
              </span>
            )
          })}
        </div>
        {messages.length > 0 ? (
          <ul id={id} className="mt-2 grid gap-1" aria-label="Problems">
            {messages.map((m) => (
              <li
                key={m.key}
                role="alert"
                className="flex items-start gap-1.5 text-xs font-medium text-destructive"
              >
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-px size-3.5 shrink-0"
                />
                {m.text}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Add another time range for ${label}`}
        disabled={ranges.length >= MAX_RANGES_PER_DAY}
        onClick={() => onChange([...ranges, nextRange(ranges)])}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  )
}
