'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TriangleAlert, ShieldCheck, Plus } from 'lucide-react'
import { PageHeader } from '@/components/custom/page-header'
import { StatusBadge } from '@/components/custom/status-badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { authClient } from '@/lib/auth-client'
import type { Link } from '@/lib/calendar-links/repository'
import { mutateCalendar } from './actions'

type DisplayLink = Pick<
  Link,
  'accountId' | 'email' | 'calendars' | 'status'
> & { lastCheckedAt: string }
export function CalendarSettings({
  links,
  accounts,
  booking,
}: {
  links: DisplayLink[]
  accounts: { id: string; email: string }[]
  booking?: { accountId: string; calendarId: string }
}) {
  const [message, setMessage] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()
  const params = useSearchParams()
  const save = (input: Parameters<typeof mutateCalendar>[0]) =>
    start(async () => {
      setMessage(await mutateCalendar(input))
      router.refresh()
    })
  useEffect(() => {
    if (params.get('linked')) {
      start(async () => {
        for (const account of accounts)
          await mutateCalendar({ operation: 'connect', accountId: account.id })
        router.replace('/calendars')
        router.refresh()
      })
    }
  }, [params, accounts, router])
  async function link(accountId?: string) {
    const response = await fetch('/calendars/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    })
    if (!response.ok) {
      setMessage('Could not start linking. Retry.')
      return
    }
    const result = await response.json()
    if (result.fake) {
      router.push('/calendars?linked=1')
      router.refresh()
      return
    }
    await authClient.linkSocial({
      provider: 'google',
      loginHint: links.find((l) => l.accountId === accountId)?.email,
      callbackURL: '/calendars?linked=1',
      scopes: [
        'https://www.googleapis.com/auth/calendar.freebusy',
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
        'https://www.googleapis.com/auth/calendar.events',
      ],
    })
  }
  return (
    <>
      <PageHeader
        title="Calendars"
        description="Linked Google accounts. Events on checked calendars block slots."
        actions={
          <Button variant="outline" onClick={() => link()}>
            <Plus />
            Link another Google account
          </Button>
        }
      />
      <p role="status" className="mb-4 text-sm">
        {pending ? 'Saving…' : message}
      </p>
      {!links.length && (
        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Connect your calendars</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Choose an account to block busy times and receive bookings.
          </p>
          {accounts.map((a) => (
            <Button
              key={a.id}
              onClick={() => save({ operation: 'connect', accountId: a.id })}
            >
              Connect {a.email || 'signed-in Google account'}
            </Button>
          ))}
        </section>
      )}
      <div className="space-y-4">
        {links.map((l) => (
          <section key={l.accountId} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">{l.email}</h2>
              <StatusBadge
                status={l.status === 'ok' ? 'connected' : 'needs-reconnect'}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    save({ operation: 'refresh', accountId: l.accountId })
                  }
                >
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm('Unlink this account from this business?'))
                      save({ operation: 'unlink', accountId: l.accountId })
                  }}
                >
                  Unlink
                </Button>
              </div>
            </div>
            {l.status === 'needs_reconnect' && (
              <div className="my-4 flex flex-wrap items-center gap-3 rounded-lg bg-highlight p-4 text-highlight-foreground">
                <TriangleAlert />
                <p className="flex-1 text-sm">
                  Connection lost since{' '}
                  {new Date(l.lastCheckedAt).toLocaleString()}. Slots are not
                  being blocked by this account.
                </p>
                <Button variant="outline" onClick={() => link(l.accountId)}>
                  Reconnect
                </Button>
              </div>
            )}
            <div className="mt-4 divide-y">
              {l.calendars.map((c) => (
                <div
                  key={c.calendarId}
                  className="flex flex-wrap items-center gap-4 py-4"
                >
                  <span className="min-w-40 flex-1 font-medium">{c.name}</span>
                  {booking?.accountId === l.accountId &&
                  booking.calendarId === c.calendarId ? (
                    <Badge className="bg-accent-strong text-accent-strong-foreground">
                      New bookings go here
                    </Badge>
                  ) : (
                    c.writable && (
                      <Button
                        variant="outline"
                        disabled={pending || l.status !== 'ok'}
                        onClick={() =>
                          save({
                            operation: 'booking',
                            accountId: l.accountId,
                            calendarId: c.calendarId,
                          })
                        }
                      >
                        Receive bookings here
                      </Button>
                    )
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      aria-label={`Blocks slots: ${c.name}`}
                      className="size-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      checked={c.blocks}
                      disabled={pending}
                      onCheckedChange={(checked) =>
                        save({
                          operation: 'block',
                          accountId: l.accountId,
                          calendarId: c.calendarId,
                          blocks: checked,
                        })
                      }
                    />
                    Blocks slots<span className="sr-only">: {c.name}</span>
                  </label>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4" />
        Only free/busy times are read. Event titles and details are never
        fetched or stored.
      </p>
    </>
  )
}
