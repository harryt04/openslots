'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from '@/components/ui/sonner'

import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  businessInputSchema,
  type ActionResult,
  type BusinessInput,
} from '@/lib/businesses/schema'
import { slugify } from '@/lib/businesses/slug'

type Props = {
  defaults?: BusinessInput
  /** Onboarding: suggest the slug from the name and the zone from the browser. */
  suggest?: boolean
  submitLabel: string
  action: (values: BusinessInput) => Promise<ActionResult>
  cancelHref?: string
}

function timezoneOptions(selected: string): string[] {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    zones = []
  }
  if (!zones.includes('UTC')) zones = ['UTC', ...zones]
  return zones.includes(selected) ? zones : [selected, ...zones]
}

export function BusinessForm({
  defaults,
  suggest = false,
  submitLabel,
  action,
  cancelHref,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const slugTouched = useRef(!suggest)
  const zoneTouched = useRef(!suggest)

  const form = useForm<BusinessInput>({
    resolver: zodResolver(businessInputSchema),
    defaultValues: defaults ?? { name: '', slug: '', timezone: 'UTC' },
  })
  const timezone = useWatch({ control: form.control, name: 'timezone' })
  const zones = useMemo(() => timezoneOptions(timezone), [timezone])

  useEffect(() => {
    if (!suggest || zoneTouched.current) return
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (browserZone) form.setValue('timezone', browserZone)
  }, [suggest, form])

  function onSubmit(values: BusinessInput) {
    setMessage(null)
    startTransition(async () => {
      const result = await action(values)
      if (result.ok) {
        if (result.redirectTo) {
          router.push(result.redirectTo)
          router.refresh()
        } else {
          toast.success('Changes saved.')
          router.refresh()
        }
        return
      }
      for (const [field, text] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(field as keyof BusinessInput, { message: text })
      }
      if (result.message) setMessage(result.message)
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-5"
        noValidate
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field: { onChange, ...field } }) => (
            <FormItem>
              <FormLabel>Business name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="organization"
                  placeholder="Shear Bliss Salon"
                  {...field}
                  onValueChange={(value) => {
                    onChange(value)
                    if (!slugTouched.current) {
                      form.setValue('slug', slugify(value), {
                        shouldValidate: form.formState.isSubmitted,
                      })
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field: { onChange, ...field } }) => (
            <FormItem>
              <FormLabel>Booking page address</FormLabel>
              <FormControl>
                <Input
                  className="font-mono"
                  autoCapitalize="none"
                  spellCheck={false}
                  {...field}
                  onValueChange={(value) => {
                    slugTouched.current = true
                    onChange(value)
                  }}
                />
              </FormControl>
              <FormDescription>
                Lower-case letters, numbers and hyphens. Must be unique on this
                server.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Time zone</FormLabel>
              <Select
                value={field.value}
                name={field.name}
                required
                items={zones}
                onValueChange={(value) => {
                  if (value === null) return
                  zoneTouched.current = true
                  field.onChange(value)
                }}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {zones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Your opening hours are read in this zone.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {message ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {message}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : submitLabel}
          </Button>
          {cancelHref ? (
            <Button variant="ghost" asChild>
              <a href={cancelHref}>Cancel</a>
            </Button>
          ) : null}
        </div>
      </form>
    </Form>
  )
}
