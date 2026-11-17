'use client'

import {
  customerFieldsFor,
  LIMITS,
  type CustomerFields,
  type PublicService,
} from '@openslots/core'
import { useId, type ReactNode, type Ref } from 'react'

import { Icon, Spinner } from './icons'
import { cx } from './root'
import { button, VisuallyHidden } from './ui'

export interface CustomerDraft {
  name: string
  email: string
  phone: string
  notes: string
}

export const emptyDraft: CustomerDraft = {
  name: '',
  email: '',
  phone: '',
  notes: '',
}

export type FieldErrors = Partial<Record<keyof CustomerDraft, string>>

/**
 * Validates the form with the rules the server uses
 * (`customerFieldsFor(service)` from `@openslots/core`, docs/TRD.md section
 * 7), with messages written for customers: the phone is required when the
 * service asks for it, notes are optional, and a field the service does not
 * ask for is never sent.
 */
export function validateCustomer(
  draft: CustomerDraft,
  service: Pick<PublicService, 'askPhone' | 'askNotes'>,
):
  { data: CustomerFields; errors: null } | { data: null; errors: FieldErrors } {
  const parsed = customerFieldsFor(service).safeParse({
    name: draft.name,
    email: draft.email.trim(),
    phone: draft.phone,
    notes: draft.notes,
  })
  if (parsed.success) return { data: parsed.data, errors: null }
  const errors: FieldErrors = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof CustomerDraft | undefined
    if (!field || errors[field]) continue
    const tooLong = issue.code === 'too_big'
    const max = {
      name: LIMITS.customerName,
      email: LIMITS.customerEmail,
      phone: LIMITS.customerPhone,
      notes: LIMITS.customerNotes,
    }[field]
    errors[field] = tooLong
      ? `Please use ${max} characters or fewer.`
      : field === 'name'
        ? 'Please enter your name.'
        : field === 'email'
          ? 'Please enter an email address, like name@example.com.'
          : field === 'phone'
            ? 'Please enter a phone number.'
            : 'Please check this field.'
  }
  return { data: null, errors }
}

const inputClass =
  'os:block os:w-full os:min-h-[38px] os:rounded-md os:border os:border-input os:bg-card os:px-2.5 os:text-sm os:text-foreground os:aria-invalid:border-destructive os:aria-invalid:border-2'

function Field({
  label,
  optional,
  hint,
  error,
  children,
}: {
  label: string
  optional?: boolean
  hint?: string
  error?: string
  children: (props: {
    id: string
    describedBy: string | undefined
  }) => ReactNode
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label
        htmlFor={id}
        className="os:block os:mb-1.5 os:text-sm os:font-medium"
      >
        {label}
        {optional ? (
          <span className="os:font-normal os:text-muted-foreground">
            {' '}
            optional
          </span>
        ) : null}
      </label>
      {children({ id, describedBy })}
      {error ? (
        // Errors are text with an icon, never color alone (T-5).
        <p
          id={errorId}
          className="os:mt-1.5 os:flex os:items-start os:gap-1.5 os:text-xs os:font-medium os:text-destructive"
        >
          <span className="os:mt-px">
            <Icon name="alert" size={14} />
          </span>
          <span>
            <VisuallyHidden>Error: </VisuallyHidden>
            {error}
          </span>
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="os:mt-1 os:text-xs os:text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export interface DetailsFormProps {
  service: Pick<PublicService, 'askPhone' | 'askNotes'>
  draft: CustomerDraft
  onDraftChange: (draft: CustomerDraft) => void
  website: string
  onWebsiteChange: (value: string) => void
  errors: FieldErrors
  submitting: boolean
  onSubmit: () => void
  /** A message above the button, such as a failed submission. */
  status?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
  className?: string
}

export function DetailsForm({
  service,
  draft,
  onDraftChange,
  website,
  onWebsiteChange,
  errors,
  submitting,
  onSubmit,
  status,
  headingRef,
  className,
}: DetailsFormProps) {
  const set = (key: keyof CustomerDraft) => (value: string) =>
    onDraftChange({ ...draft, [key]: value })
  const websiteId = useId()

  return (
    <form
      noValidate
      className={cx('os:relative os:grid os:gap-3 os:content-start', className)}
      aria-busy={submitting || undefined}
      onSubmit={(event) => {
        event.preventDefault()
        if (!submitting) onSubmit()
      }}
    >
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="os:text-lg os:font-semibold os:focus-visible:outline-none"
      >
        Your details
      </h2>

      <Field label="Name" error={errors.name}>
        {({ id, describedBy }) => (
          <input
            id={id}
            name="name"
            autoComplete="name"
            placeholder="Alex Morgan"
            required
            maxLength={LIMITS.customerName + 20}
            value={draft.name}
            onChange={(e) => set('name')(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy}
            className={inputClass}
          />
        )}
      </Field>

      <Field
        label="Email"
        hint="Your calendar invitation is sent here."
        error={errors.email}
      >
        {({ id, describedBy }) => (
          <input
            id={id}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="alex@example.com"
            required
            value={draft.email}
            onChange={(e) => set('email')(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy}
            className={inputClass}
          />
        )}
      </Field>

      {service.askPhone ? (
        <Field label="Phone" error={errors.phone}>
          {({ id, describedBy }) => (
            <input
              id={id}
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="(555) 010-0199"
              required
              maxLength={LIMITS.customerPhone + 20}
              value={draft.phone}
              onChange={(e) => set('phone')(e.target.value)}
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={describedBy}
              className={inputClass}
            />
          )}
        </Field>
      ) : null}

      {service.askNotes ? (
        <Field label="Notes" optional error={errors.notes}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              name="notes"
              rows={3}
              value={draft.notes}
              onChange={(e) => set('notes')(e.target.value)}
              aria-invalid={errors.notes ? true : undefined}
              aria-describedby={describedBy}
              className={cx(inputClass, 'os:py-2')}
            />
          )}
        </Field>
      ) : null}

      {/*
       * The honeypot the contract names (`website`). People never see or
       * reach it; bots that fill every field give themselves away.
       */}
      <div
        aria-hidden="true"
        className="os:absolute os:-left-[10000px] os:top-auto os:w-px os:h-px os:overflow-hidden"
      >
        <label htmlFor={websiteId}>Leave this field empty</label>
        <input
          id={websiteId}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => onWebsiteChange(e.target.value)}
        />
      </div>

      {status}

      <button
        type="submit"
        className={cx(button.primary, button.large, 'os:w-full')}
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Spinner />
            Booking…
          </>
        ) : (
          'Confirm booking'
        )}
      </button>
    </form>
  )
}
