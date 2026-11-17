import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/custom/logo'
import { Button } from '@/components/ui/button'
import { isFakeGoogle } from '@/lib/env'
import { GoogleSignIn } from './google-sign-in'
export const metadata: Metadata = { title: 'Sign in' }
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen md:grid-cols-2">
        <section className="flex min-h-80 flex-col justify-between gap-6 bg-linear-to-br from-primary to-[color-mix(in_srgb,var(--primary)_55%,var(--accent))] p-10 text-[var(--brand-panel-foreground)]">
          <Logo className="[&_i]:bg-primary [&_i:nth-child(3)]:bg-accent-strong [&>span]:bg-[var(--brand-panel-foreground)]" />
          <div>
            <p className="text-3xl leading-tight font-semibold tracking-tight">
              Your calendar.
              <br />
              Your server.
              <br />
              Your customers.
            </p>
            <p className="mt-3">Free and open source appointment booking.</p>
          </div>
        </section>
        <section className="mx-auto grid w-full max-w-[420px] content-center gap-3.5 p-10">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground">
            Use the Google account whose calendar you take appointments on.
          </p>
          <GoogleSignIn initialError={error} />
          <p className="text-xs text-muted-foreground">
            OpenSlots will ask to see when you are busy and to add bookings to a
            calendar you choose. It never reads event details.
          </p>
          {isFakeGoogle() && (
            <Button asChild variant="outline">
              <Link href="/dev/sign-in">Use the test sign-in</Link>
            </Button>
          )}
        </section>
      </div>
    </main>
  )
}
