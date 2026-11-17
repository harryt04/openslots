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
    <main className="grid min-h-screen place-items-center p-4 sm:p-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-xl border bg-card shadow-sm md:grid-cols-2">
        <section className="flex min-h-80 flex-col justify-between gap-6 bg-linear-to-br from-primary to-[color-mix(in_srgb,var(--primary)_85%,var(--accent))] p-10 text-primary-foreground">
          <Logo />
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
        <section className="grid content-center gap-3.5 p-10">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground">
            Use the Google account whose calendar you take appointments on.
          </p>
          <GoogleSignIn />
          <p className="text-xs text-muted-foreground">
            OpenSlots will ask to see when you are busy and to add bookings to a
            calendar you choose. It never reads event details.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              Sign-in refused. Your Google account may not be allowed on this
              instance. Contact the instance owner or try an allowed account.
            </p>
          )}
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
