'use client'
import '@openslots/react/styles.css'
import { useState, useTransition } from 'react'
import { SlotPicker } from '@openslots/react'
import { Copy, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/custom/status-badge'
import { changeBooking } from './actions'
export type Row = {
  id: string
  serviceId: string
  service: { name: string; durationMin: number }
  start: string
  end: string
  createdAt: string
  customer: {
    name: string
    email: string
    phone?: string
    notes?: string
    timezone: string
  }
  status: 'confirmed' | 'pending' | 'cancelled'
  rescheduled: boolean
  cleanup: boolean
  eventSync: boolean
  color: string
}
export function BookingRow({
  row,
  timezone,
  publishableKey,
}: {
  row: Row
  timezone: string
  publishableKey: string
}) {
  const [host, setHost] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'details' | 'cancel' | 'reschedule'>(
    'details',
  )
  const [start, setStart] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, transition] = useTransition()
  const time = (value: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  const status =
    row.status === 'confirmed' && row.rescheduled ? 'rescheduled' : row.status
  function submit(action: 'cancel' | 'reschedule') {
    transition(async () => {
      const result = await changeBooking({
        id: row.id,
        action,
        ...(start ? { start } : {}),
      })
      if (result.error) setError(result.error)
      else {
        setOpen(false)
        window.location.reload()
      }
    })
  }
  return (
    <>
      <button
        data-agent-hidden=""
        data-agent-secret=""
        type="button"
        onClick={() => {
          setHost(location.origin)
          setOpen(true)
          setStep('details')
          setError('')
        }}
        className={`grid w-full grid-cols-[4px_1fr] items-center gap-4 border-b p-4 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:grid-cols-[4px_175px_1fr_180px_120px] ${row.status === 'cancelled' ? 'text-muted-foreground' : ''}`}
      >
        <span className={`h-full min-h-10 rounded ${row.color}`} />
        <span
          className={`font-mono text-sm ${row.status === 'cancelled' ? 'line-through' : ''}`}
        >
          {time(row.start)} – {time(row.end)}
        </span>
        <span className="col-start-2 min-w-0 break-words md:col-start-auto">
          <strong>{row.customer.name}</strong>
          <span className="block text-xs break-all text-muted-foreground">
            {row.customer.email}
          </span>
          {row.customer.notes && (
            <span className="block text-sm">“{row.customer.notes}”</span>
          )}
          {(row.cleanup || row.eventSync) && (
            <span className="flex items-center gap-1 text-xs">
              <TriangleAlert className="size-3" />
              {row.cleanup
                ? 'Calendar event is being removed'
                : 'Calendar not updated yet'}
            </span>
          )}
        </span>
        <span className="col-start-2 text-sm md:col-start-auto">
          <span
            className={`mr-2 inline-block size-2 rounded-full ${row.color}`}
          />
          {row.service.name}
          <span className="block font-mono text-xs text-muted-foreground">
            {row.service.durationMin} min
          </span>
        </span>
        <span className="col-start-2 min-w-0 break-words md:col-start-auto">
          <StatusBadge status={status} />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-agent-hidden=""
          data-agent-secret=""
          className={
            step === 'reschedule'
              ? 'max-h-[90vh] overflow-y-auto sm:max-w-3xl'
              : 'max-h-[90vh] overflow-y-auto'
          }
        >
          <DialogHeader>
            <DialogTitle>
              {step === 'cancel'
                ? 'Cancel this booking?'
                : step === 'reschedule'
                  ? 'Reschedule booking'
                  : row.service.name}
            </DialogTitle>
            <DialogDescription>
              {new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                dateStyle: 'full',
              }).format(new Date(row.start))}{' '}
              · {time(row.start)} – {time(row.end)} · {timezone}
            </DialogDescription>
          </DialogHeader>
          {step === 'details' && (
            <dl className="grid gap-3 text-sm">
              {Object.entries({
                Customer: row.customer.name,
                Email: row.customer.email,
                Phone: row.customer.phone || 'Not supplied',
                Notes: row.customer.notes || 'None',
                'Customer timezone': row.customer.timezone,
                'Booked on': new Intl.DateTimeFormat('en-US', {
                  timeZone: timezone,
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(row.createdAt)),
                Status: status,
              }).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-words whitespace-pre-wrap">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {step === 'cancel' && (
            <p>The booking will be cancelled and its calendar event removed.</p>
          )}
          {step === 'reschedule' && host && (
            <SlotPicker
              host={host!}
              publishableKey={publishableKey}
              service={{ id: row.serviceId, ...row.service }}
              timezone={timezone}
              value={start}
              onChange={(slot) => setStart(slot?.start ?? null)}
            />
          )}
          {error && (
            <p role="alert" className="flex gap-2 text-sm">
              <TriangleAlert className="size-4" />
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {step !== 'details' && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setStep('details')
                  setError('')
                }}
              >
                Back
              </Button>
            )}
            {step === 'details' && row.status === 'confirmed' && (
              <>
                <Button variant="outline" onClick={() => setStep('cancel')}>
                  Cancel booking
                </Button>
                <Button onClick={() => setStep('reschedule')}>
                  Reschedule
                </Button>
              </>
            )}
            {step === 'cancel' && (
              <Button disabled={pending} onClick={() => submit('cancel')}>
                Confirm cancellation
              </Button>
            )}
            {step === 'reschedule' && host && (
              <Button
                disabled={pending || !start}
                onClick={() => submit('reschedule')}
              >
                Confirm reschedule
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
export function CopyBookingLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(`${location.origin}/b/${slug}`)
        setCopied(true)
      }}
    >
      <Copy aria-hidden="true" />
      {copied ? 'Copied booking link' : 'Copy booking link'}
    </Button>
  )
}
