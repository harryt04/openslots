'use client'

import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { RangeFields } from '@/components/custom/range-fields'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  nextRange,
  rangeToText,
  validateOverrideDraft,
  type RangeText,
} from '@/lib/schedules/draft'
import {
  dateFromLocalDate,
  formatDate,
  localDateFromDate,
} from '@/lib/schedules/time'
import type { ScheduleOverride } from '@openslots/core'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The override being edited, or null to add one. */
  editing: ScheduleOverride | null
  /** Dates that already have an override (they cannot be picked again). */
  takenDates: string[]
  /** Today in the schedule's timezone; earlier dates cannot be picked. */
  today: string
  onSave: (override: ScheduleOverride) => void
}

export function OverrideDialog(props: Props) {
  // Remount on each open so the form always starts from its own inputs.
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? (
        <OverrideForm key={props.editing?.date ?? 'new'} {...props} />
      ) : null}
    </Dialog>
  )
}

function OverrideForm({
  onOpenChange,
  editing,
  takenDates,
  today,
  onSave,
}: Props) {
  const [date, setDate] = useState<string | null>(editing?.date ?? null)
  const [closed, setClosed] = useState(
    editing ? editing.ranges.length === 0 : true,
  )
  const [ranges, setRanges] = useState<RangeText[]>(
    editing && editing.ranges.length > 0
      ? editing.ranges.map(rangeToText)
      : [nextRange([])],
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  function submit() {
    const result = validateOverrideDraft(date, closed, ranges)
    setErrors(result.errors)
    if (!result.override) return
    onSave(result.override)
    onOpenChange(false)
  }

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>
          {editing ? 'Edit date override' : 'Add date override'}
        </DialogTitle>
        <DialogDescription>
          {editing
            ? `Hours for ${formatDate(editing.date)} instead of the usual ones.`
            : 'Pick a date, then close it or give it different hours.'}
        </DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {editing ? (
          <p className="text-sm font-medium">{formatDate(editing.date)}</p>
        ) : (
          <div className="grid gap-2">
            <Label id="override-date-label">Date</Label>
            <div className="flex justify-center rounded-md border">
              <Calendar
                mode="single"
                selected={date ? dateFromLocalDate(date) : undefined}
                defaultMonth={dateFromLocalDate(date ?? today)}
                onSelect={(d) => setDate(d ? localDateFromDate(d) : null)}
                disabled={[
                  { before: dateFromLocalDate(today) },
                  ...takenDates.map(dateFromLocalDate),
                ]}
                aria-labelledby="override-date-label"
              />
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {date ? `Selected: ${formatDate(date)}` : 'No date selected.'}
            </p>
            {errors.date ? (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-xs font-medium text-destructive"
              >
                <TriangleAlert aria-hidden="true" className="size-3.5" />
                {errors.date}
              </p>
            ) : null}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Switch
            id="override-closed"
            checked={closed}
            onCheckedChange={setClosed}
          />
          <Label htmlFor="override-closed">Closed all day</Label>
        </div>

        {closed ? null : (
          <div className="grid gap-2">
            <Label>Open hours</Label>
            <RangeFields
              ranges={ranges}
              onChange={setRanges}
              label="Override"
              errors={errors}
              prefix="ranges"
              id="override-errors"
            />
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit">
            {editing ? 'Update override' : 'Add override'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
