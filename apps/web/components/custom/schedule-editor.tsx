'use client'

import {
  CircleDot,
  Globe,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from '@/components/ui/sonner'

import {
  createScheduleAction,
  deleteScheduleAction,
  saveScheduleAction,
} from '@/app/actions/schedules'
import { OverrideDialog } from '@/components/custom/override-dialog'
import { PageHeader } from '@/components/custom/page-header'
import { RangeFields } from '@/components/custom/range-fields'
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  isDirty,
  nextRange,
  toDraft,
  validateDraft,
  type SavedSchedule,
  type ScheduleDraft,
} from '@/lib/schedules/draft'
import {
  overrideKind,
  sortOverrides,
  type OverrideKind,
} from '@/lib/schedules/overrides'
import {
  formatDate,
  formatRanges,
  formatTime,
  timeZoneLabel,
  timeZoneOptions,
} from '@/lib/schedules/time'
import type { FieldErrors } from '@/lib/schedules/validate'
import { localDateOf, type ScheduleOverride } from '@openslots/core'

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

type ScheduleView = SavedSchedule & { id: string }

const badgeFor: Record<OverrideKind, { status: Status; label?: string }> = {
  closed: { status: 'closed' },
  'short-day': { status: 'short-day' },
  'extra-day': { status: 'extra-day' },
  'changed-hours': { status: 'short-day', label: 'Changed hours' },
  'usual-hours': { status: 'short-day', label: 'Usual hours' },
}

export function ScheduleEditor({ schedules }: { schedules: ScheduleView[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState(schedules[0]?.id ?? '')
  const [drafts, setDrafts] = useState<Record<string, ScheduleDraft>>({})
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameText, setRenameText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [editingOverride, setEditingOverride] =
    useState<ScheduleOverride | null>(null)

  const saved = schedules.find((s) => s.id === selectedId) ?? schedules[0]
  const id = saved?.id ?? ''
  const draft = useMemo(
    () => (saved ? (drafts[id] ?? toDraft(saved)) : null),
    [drafts, id, saved],
  )

  const dirtyById = useMemo(() => {
    const result: Record<string, boolean> = {}
    for (const s of schedules) {
      const d = drafts[s.id]
      result[s.id] = d ? isDirty(d, s) : false
    }
    return result
  }, [schedules, drafts])
  const anyDirty = Object.values(dirtyById).some(Boolean)

  useEffect(() => {
    if (!anyDirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [anyDirty])

  if (!saved || !draft) return null
  const clientErrors = validateDraft(draft).errors
  const errors: FieldErrors = { ...serverErrors, ...clientErrors }
  const hasErrors = Object.keys(clientErrors).length > 0

  const edit = (patch: Partial<ScheduleDraft>) => {
    setServerErrors({})
    setMessage(null)
    setDrafts((all) => ({ ...all, [id]: { ...draft, ...patch } }))
  }
  const setDay = (d: number, ranges: ScheduleDraft['weekly'][number]) =>
    edit({ weekly: draft.weekly.map((day, i) => (i === d ? ranges : day)) })

  const { result } = validateDraft(draft)
  const today = localDateOf(new Date(), draft.timezone)

  const parsedOverrides = result.ok ? result.data.overrides : saved.overrides // while a draft has errors, show what is saved
  const parsedWeekly = result.ok ? result.data.weekly : saved.weekly
  const sortedOverrides = sortOverrides(parsedOverrides)
  const upcoming = sortedOverrides.filter((o) => o.date >= today)
  const past = sortedOverrides.filter((o) => o.date < today)

  function save() {
    setMessage(null)
    if (!result.ok) {
      setServerErrors({})
      setMessage('Fix the highlighted problems, then save again.')
      return
    }
    const submitted = drafts[id]
    startTransition(async () => {
      const response = await saveScheduleAction(id, result.data)
      if (response.ok) {
        toast.success('Availability saved.')
        // Keep the draft if it was edited again while the save was in flight.
        setDrafts((all) => (all[id] === submitted ? withoutKey(all, id) : all))
        router.refresh()
        return
      }
      setServerErrors(response.errors ?? {})
      setMessage(
        response.message ?? 'Fix the highlighted problems, then save again.',
      )
    })
  }

  function addSchedule() {
    startTransition(async () => {
      const response = await createScheduleAction()
      if (response.ok && response.id) {
        setSelectedId(response.id)
        router.refresh()
      } else if (!response.ok) {
        setMessage(response.message ?? 'Could not create a schedule.')
      }
    })
  }

  function removeSchedule() {
    startTransition(async () => {
      const response = await deleteScheduleAction(id)
      setDeleting(false)
      if (response.ok) {
        toast.success('Schedule deleted.')
        setDrafts((all) => withoutKey(all, id))
        setSelectedId(schedules.find((s) => s.id !== id)?.id ?? '')
        router.refresh()
      } else {
        setMessage(response.message ?? 'Could not delete the schedule.')
      }
    })
  }

  function saveOverride(override: ScheduleOverride) {
    // Work on the draft itself, never on the parsed copy: while another field
    // is invalid the parsed copy falls back to what is saved, and using it
    // here would silently drop every other unsaved override.
    const others = draft!.overrides.filter((o) => o.date !== override.date)
    edit({
      overrides: sortOverrides([
        ...others,
        {
          date: override.date,
          ranges: override.ranges.map((r) => ({
            start: formatTime(r.startMin),
            end: formatTime(r.endMin),
          })),
        },
      ]),
    })
  }

  const overrideRow = (o: ScheduleOverride, isPast: boolean) => {
    const kind = overrideKind(o, parsedWeekly)
    const badge = badgeFor[kind]
    return (
      <li
        key={o.date}
        className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2.5 ${isPast ? 'opacity-70' : ''}`}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {formatDate(o.date, new Date().getFullYear())}
            {isPast ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                (past)
              </span>
            ) : null}
          </p>
          <p
            className={`text-xs text-muted-foreground ${o.ranges.length > 0 ? 'font-mono whitespace-nowrap' : ''}`}
          >
            {o.ranges.length > 0 ? formatRanges(o.ranges) : 'Closed all day'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <StatusBadge status={badge.status} label={badge.label} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit override for ${formatDate(o.date, new Date().getFullYear())}`}
            onClick={() => {
              setEditingOverride(o)
              setOverrideOpen(true)
            }}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove override for ${formatDate(o.date, new Date().getFullYear())}`}
            onClick={() =>
              edit({
                overrides: draft.overrides.filter((x) => x.date !== o.date),
              })
            }
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </li>
    )
  }

  return (
    <>
      <PageHeader
        title="Availability"
        description="The days and hours customers may book. Google events are subtracted on top of this."
        actions={
          <div className="flex items-center gap-3">
            <span
              className="flex items-center gap-1.5 text-sm font-medium"
              role="status"
            >
              {anyDirty ? (
                <>
                  <CircleDot aria-hidden="true" className="size-4" />
                  Unsaved changes
                </>
              ) : null}
            </span>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        }
      />

      {message ? (
        <p
          role="alert"
          className="mb-3 flex items-center gap-1.5 text-sm font-medium text-destructive"
        >
          <TriangleAlert aria-hidden="true" className="size-4" />
          {message}
        </p>
      ) : null}

      <Tabs
        agentNavigable
        aria-label="Schedules"
        value={id}
        onValueChange={(value) => {
          setSelectedId(value)
          setMessage(null)
          setServerErrors({})
        }}
      >
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <TabsList aria-label="Schedules">
              {schedules.map((s) => (
                <TabsTrigger key={s.id} value={s.id}>
                  {drafts[s.id]?.name || s.name}
                  {dirtyById[s.id] ? (
                    <>
                      <CircleDot aria-hidden="true" className="size-3" />
                      <span className="sr-only"> (unsaved changes)</span>
                    </>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addSchedule}
              disabled={pending}
            >
              <Plus aria-hidden="true" />
              New schedule
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Globe
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <Label htmlFor="schedule-timezone" className="sr-only">
              Time zone
            </Label>
            <Select
              value={draft.timezone}
              onValueChange={(timezone) => edit({ timezone })}
            >
              <SelectTrigger id="schedule-timezone" className="w-auto max-w-72">
                <SelectValue>{timeZoneLabel(draft.timezone)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {timeZoneOptions(draft.timezone).map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {timeZoneLabel(zone)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent
          value={id}
          className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
        >
          <div className="grid content-start gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{draft.name}</h2>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRenameText(draft.name)
                    setRenaming(true)
                  }}
                >
                  <Pencil aria-hidden="true" />
                  Rename
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </div>
            {errors.name ? (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-xs font-medium text-destructive"
              >
                <TriangleAlert aria-hidden="true" className="size-3.5" />
                {errors.name}
              </p>
            ) : null}
            {errors.timezone ? (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-xs font-medium text-destructive"
              >
                <TriangleAlert aria-hidden="true" className="size-3.5" />
                {errors.timezone}
              </p>
            ) : null}
            <div className="rounded-xl border bg-card">
              {DAYS.map((day, d) => {
                const ranges = draft.weekly[d] ?? []
                const open = ranges.length > 0
                return (
                  <div
                    key={day}
                    className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-b px-3.5 py-3 last:border-b-0 sm:grid-cols-[36px_96px_minmax(0,1fr)]"
                  >
                    <Switch
                      checked={open}
                      aria-label={day}
                      className="mt-2"
                      onCheckedChange={(on) =>
                        setDay(d, on ? [nextRange([])] : [])
                      }
                    />
                    <span
                      className={`pt-1.5 text-sm font-semibold ${open ? '' : 'text-muted-foreground'}`}
                    >
                      {day}
                    </span>
                    <div className="col-span-2 sm:col-span-1 sm:col-start-3">
                      {open ? (
                        <RangeFields
                          ranges={ranges}
                          onChange={(r) => setDay(d, r)}
                          label={day}
                          errors={errors}
                          prefix={`weekly.${d}`}
                          id={`week-errors-${d}`}
                        />
                      ) : (
                        <span className="inline-block pt-1.5 text-sm text-muted-foreground">
                          Closed
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="content-start rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Date overrides</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingOverride(null)
                  setOverrideOpen(true)
                }}
              >
                <Plus aria-hidden="true" />
                Add
              </Button>
            </div>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              Holidays, half days, or one-off extra hours.
            </p>
            {errors.overrides ? (
              <p
                role="alert"
                className="mb-2 flex items-center gap-1.5 text-xs font-medium text-destructive"
              >
                <TriangleAlert aria-hidden="true" className="size-3.5" />
                {errors.overrides}
              </p>
            ) : null}
            {sortedOverrides.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No overrides. Normal weekly hours apply every week.
              </p>
            ) : null}
            {upcoming.length > 0 ? (
              <ul className="grid gap-2" aria-label="Upcoming overrides">
                {upcoming.map((o) => overrideRow(o, false))}
              </ul>
            ) : null}
            {past.length > 0 ? (
              <>
                <h3 className="mt-4 mb-2 text-xs font-semibold text-muted-foreground">
                  Past overrides
                </h3>
                <ul className="grid gap-2" aria-label="Past overrides">
                  {past.map((o) => overrideRow(o, true))}
                </ul>
              </>
            ) : null}
            {hasErrors && !result.ok ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Overrides show the last saved hours until the weekly hours are
                fixed.
              </p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>

      <OverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        editing={editingOverride}
        takenDates={draft.overrides.map((o) => o.date)}
        today={today}
        onSave={saveOverride}
      />

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename schedule</DialogTitle>
            <DialogDescription>
              Services choose a schedule by this name.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (renameText.trim()) {
                edit({ name: renameText })
                setRenaming(false)
              }
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="schedule-name">Name</Label>
              <Input
                id="schedule-name"
                value={renameText}
                maxLength={100}
                onValueChange={setRenameText}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenaming(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!renameText.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{saved.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its weekly hours and date overrides are removed. A business keeps
              at least one schedule, and a schedule that a service uses cannot
              be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep schedule</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                removeSchedule()
              }}
            >
              Delete schedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function withoutKey<T>(all: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(all).filter(([k]) => k !== key))
}
