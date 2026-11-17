'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  DURATION_PRESETS,
  MAX_DURATION_MIN,
  MIN_DURATION_MIN,
  SERVICE_COLORS,
  BLOCK_MINUTES,
  type Schedule,
} from '@openslots/core'
import { Check, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm, useWatch, type Control } from 'react-hook-form'
import { toast } from 'sonner'

import { PageHeader } from '@/components/custom/page-header'
import { ServicePreview } from '@/components/custom/service-preview'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  deleteServiceAction,
  type createServiceAction,
} from '@/app/actions/services'
import {
  SERVICE_COLOR_LABEL,
  SERVICE_SWATCH_CLASS,
} from '@/lib/services/colors'
import { formatDays, formatMinutes } from '@/lib/services/format'
import {
  serviceFormSchema,
  serviceParseOptions,
  type ServiceFormValues,
} from '@/lib/services/schema'
import { cn } from '@/lib/utils'

export type EditorSchedule = Schedule & {
  id: string
  name: string
  /** `Mon to Fri`. */
  days: string
}

type Option = { value: number; label: string }

const minutes = (values: number[], none = 'None'): Option[] =>
  values.map((v) => ({ value: v, label: v === 0 ? none : `${v} min` }))

const BUFFER_OPTIONS = minutes([0, 5, 10, 15, 20, 30, 45, 60, 90, 120])
const INTERVAL_OPTIONS = minutes([5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240])
const NOTICE_OPTIONS: Option[] = [
  0, 30, 60, 120, 240, 720, 1440, 2880, 4320, 10_080,
].map((v) => ({
  value: v,
  label:
    v === 0
      ? 'None'
      : formatMinutes(v).replace(/ hr$/, v === 60 ? ' hour' : ' hours'),
}))
const WINDOW_OPTIONS: Option[] = [7, 14, 30, 60, 90, 180, 365].map((v) => ({
  value: v,
  label: `${formatDays(v)} ahead`,
}))
const NO_LIMIT = 'none'
const MAX_OPTIONS: Option[] = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map(
  (v) => ({ value: v, label: String(v) }),
)

/** The options, plus the current value if it is not one of them. */
function withCurrent(
  options: Option[],
  value: number | undefined,
  label: (v: number) => string,
): Option[] {
  if (value === undefined || options.some((o) => o.value === value)) {
    return options
  }
  return [...options, { value, label: label(value) }].sort(
    (a, b) => a.value - b.value,
  )
}

const CUSTOM = 'custom'
const isPreset = (min: number) =>
  (DURATION_PRESETS as readonly number[]).includes(min)

type Props = {
  mode: 'create' | 'edit'
  serviceId?: string
  defaults: ServiceFormValues
  schedules: EditorSchedule[]
  /** Request time, ISO, so the server and client render the same preview. */
  now: string
  action: (values: ServiceFormValues) => ReturnType<typeof createServiceAction>
}

export function ServiceForm({
  mode,
  serviceId,
  defaults,
  schedules,
  now,
  action,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [deleting, startDelete] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [customDuration, setCustomDuration] = useState(
    !isPreset(defaults.durationMin),
  )

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema, serviceParseOptions),
    defaultValues: defaults,
    mode: 'onTouched',
  })
  const name = useWatch({ control: form.control, name: 'name' })

  function onSubmit(values: ServiceFormValues) {
    setMessage(null)
    startTransition(async () => {
      const result = await action(values)
      if (result.ok) {
        toast.success(mode === 'create' ? 'Service created.' : 'Changes saved.')
        router.push(result.redirectTo ?? '/services')
        router.refresh()
        return
      }
      for (const [field, text] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(field as keyof ServiceFormValues, { message: text })
      }
      if (result.message) setMessage(result.message)
    })
  }

  function onDelete() {
    if (!serviceId) return
    startDelete(async () => {
      const result = await deleteServiceAction(serviceId)
      if (!result.ok) {
        toast.error(result.message ?? 'Could not delete the service.')
        return
      }
      toast.success('Service deleted.')
      router.push('/services')
      router.refresh()
    })
  }

  const title = mode === 'create' ? 'New service' : name.trim() || defaults.name

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/services" className="rounded-sm hover:underline">
            Services /
          </Link>
        }
        title={title}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/services">Cancel</Link>
            </Button>
            <Button type="submit" form="service-form" disabled={pending}>
              {pending
                ? 'Saving…'
                : mode === 'create'
                  ? 'Create service'
                  : 'Save changes'}
            </Button>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Form {...form}>
          <form
            id="service-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid content-start gap-4"
            noValidate
          >
            {message ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {message}
              </p>
            ) : null}

            <Card className="gap-4 p-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Full color" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel id="color-label">Color</FormLabel>
                      <FormControl>
                        <RadioGroup
                          aria-labelledby="color-label"
                          value={field.value}
                          onValueChange={field.onChange}
                          className="flex h-9 items-center gap-2"
                        >
                          {SERVICE_COLORS.map((c) => {
                            const selected = field.value === c
                            return (
                              <span key={c} className="relative grid">
                                <RadioGroupItem
                                  value={c}
                                  aria-label={SERVICE_COLOR_LABEL[c]}
                                  className={cn(
                                    'size-6 rounded-md border-0 shadow-none [&_[data-slot=radio-group-indicator]]:hidden',
                                    SERVICE_SWATCH_CLASS[c],
                                    selected &&
                                      'ring-2 ring-foreground ring-offset-2 ring-offset-card',
                                  )}
                                />
                                {selected ? (
                                  <Check
                                    aria-hidden="true"
                                    strokeWidth={3}
                                    className="pointer-events-none absolute inset-0 m-auto size-4 text-svc-foreground"
                                  />
                                ) : null}
                              </span>
                            )
                          })}
                        </RadioGroup>
                      </FormControl>
                      <FormDescription>
                        {SERVICE_COLOR_LABEL[field.value]}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description shown to customers</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        placeholder="All-over color or balayage. Includes wash and blow dry."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Card>

            <Card className="gap-4 p-5">
              <FormField
                control={form.control}
                name="durationMin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel id="duration-label">Duration</FormLabel>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      spacing={2}
                      aria-labelledby="duration-label"
                      className="flex-wrap"
                      value={customDuration ? CUSTOM : String(field.value)}
                      onValueChange={(value) => {
                        if (!value) return
                        if (value === CUSTOM) {
                          setCustomDuration(true)
                          return
                        }
                        setCustomDuration(false)
                        field.onChange(Number(value))
                      }}
                    >
                      {[...DURATION_PRESETS.map(String), CUSTOM].map((v) => {
                        const on = customDuration
                          ? v === CUSTOM
                          : v === String(field.value)
                        return (
                          <ToggleGroupItem
                            key={v}
                            value={v}
                            className="h-[30px] rounded-full px-3 font-mono text-[12.5px] data-[spacing=2]:rounded-full data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                          >
                            {on ? <Check aria-hidden="true" /> : null}
                            {v === CUSTOM ? (
                              <span className="font-sans">Custom</span>
                            ) : (
                              v
                            )}
                          </ToggleGroupItem>
                        )
                      })}
                    </ToggleGroup>
                    {customDuration ? (
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={MIN_DURATION_MIN}
                            max={MAX_DURATION_MIN}
                            step={BLOCK_MINUTES}
                            aria-label="Custom duration in minutes"
                            className="w-28 font-mono"
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            value={Number.isNaN(field.value) ? '' : field.value}
                            onChange={(e) =>
                              field.onChange(e.target.valueAsNumber)
                            }
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground">
                          min
                        </span>
                      </div>
                    ) : null}
                    <FormDescription>
                      Minutes. Any multiple of {BLOCK_MINUTES} up to{' '}
                      {MAX_DURATION_MIN / 60} hours through Custom.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <NumberSelect
                  control={form.control}
                  name="bufferBeforeMin"
                  label="Buffer before"
                  options={BUFFER_OPTIONS}
                />
                <NumberSelect
                  control={form.control}
                  name="bufferAfterMin"
                  label="Buffer after"
                  options={BUFFER_OPTIONS}
                />
                <NumberSelect
                  control={form.control}
                  name="startIntervalMin"
                  label="Start times every"
                  options={INTERVAL_OPTIONS}
                />
              </div>
              <p className="-mt-1 text-xs text-muted-foreground">
                Buffers keep time free around each booking. Start times are
                independent of the duration, so a 180 min service can start
                every hour.
              </p>
            </Card>

            <Card className="gap-4 p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <NumberSelect
                  control={form.control}
                  name="minNoticeMin"
                  label="Minimum notice"
                  options={NOTICE_OPTIONS}
                />
                <NumberSelect
                  control={form.control}
                  name="windowDays"
                  label="Book up to"
                  options={WINDOW_OPTIONS}
                  formatOther={(v) => `${formatDays(v)} ahead`}
                />
                <NumberSelect
                  control={form.control}
                  name="maxPerDay"
                  label="Max per day"
                  options={MAX_OPTIONS}
                  formatOther={String}
                  optional="No limit"
                />
              </div>
              <FormField
                control={form.control}
                name="scheduleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Uses schedule</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a schedule" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {schedules.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.days})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Opening hours are edited on the Availability page.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Card>

            <Card className="gap-3 p-5">
              <h2 className="text-sm font-medium">Ask the customer for</h2>
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="ask-name-email" className="text-sm">
                    Name and email{' '}
                    <span className="text-xs text-muted-foreground">
                      always required
                    </span>
                  </label>
                  <Switch
                    id="ask-name-email"
                    checked
                    disabled
                    aria-label="Name and email, always required"
                  />
                </div>
                <AskSwitch
                  control={form.control}
                  name="askPhone"
                  label="Phone number"
                />
                <AskSwitch
                  control={form.control}
                  name="askNotes"
                  label="Notes"
                />
              </div>
            </Card>

            {mode === 'edit' ? (
              <Card className="flex-row flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <h2 className="text-sm font-medium">Delete this service</h2>
                  <p className="text-xs text-muted-foreground">
                    To stop bookings for a while, pause it on the Services page
                    instead.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" disabled={deleting}>
                      <Trash2 /> Delete service
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete {defaults.name}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Customers will no longer be able to book it and its link
                        will stop working. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep service</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={onDelete}
                      >
                        <Trash2 /> Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </Card>
            ) : null}
          </form>
        </Form>

        <aside
          aria-label="Preview"
          className="lg:sticky lg:top-6 lg:self-start"
        >
          <ServicePreview
            control={form.control}
            schedules={schedules}
            now={now}
          />
        </aside>
      </div>
    </>
  )
}

type NumberField =
  | 'bufferBeforeMin'
  | 'bufferAfterMin'
  | 'startIntervalMin'
  | 'minNoticeMin'
  | 'windowDays'
  | 'maxPerDay'

function NumberSelect({
  control,
  name,
  label,
  options,
  formatOther = (v) => `${v} min`,
  optional,
}: {
  control: Control<ServiceFormValues>
  name: NumberField
  label: string
  options: Option[]
  formatOther?: (v: number) => string
  /** Label of an extra "unset" option; the field is then optional. */
  optional?: string
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const value = field.value as number | undefined
        const all = withCurrent(options, value, formatOther)
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <Select
              value={value === undefined ? NO_LIMIT : String(value)}
              onValueChange={(v) =>
                field.onChange(v === NO_LIMIT ? undefined : Number(v))
              }
            >
              <FormControl>
                <SelectTrigger className="w-full" onBlur={field.onBlur}>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {optional ? (
                  <SelectItem value={NO_LIMIT}>{optional}</SelectItem>
                ) : null}
                {all.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}

function AskSwitch({
  control,
  name,
  label,
}: {
  control: Control<ServiceFormValues>
  name: 'askPhone' | 'askNotes'
  label: string
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-center justify-between gap-3">
          <FormLabel className="font-normal">{label}</FormLabel>
          <FormControl>
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
              onBlur={field.onBlur}
            />
          </FormControl>
        </FormItem>
      )}
    />
  )
}
