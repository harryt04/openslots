import type { Metadata } from 'next'
import Link from 'next/link'

import { Logo } from '@/components/custom/logo'
import { Button } from '@/components/ui/button'
import { isFakeGoogle } from '@/lib/env'

export const metadata: Metadata = { title: 'Sign in' }

// Placeholder for screen S1, which slice 1B builds with Google sign-in.
export default function Login() {
  return (
    <main className="grid min-h-screen place-content-center gap-4 p-10">
      <Logo />
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="max-w-sm text-muted-foreground">
        Google sign-in is not configured on this instance yet.
      </p>
      {isFakeGoogle() ? (
        <Button asChild variant="outline" size="lg">
          <Link href="/dev/sign-in">Use the test sign-in</Link>
        </Button>
      ) : null}
    </main>
  )
}
