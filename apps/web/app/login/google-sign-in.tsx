'use client'
import { AlertCircle } from 'lucide-react'
import { GoogleMark } from './google-mark'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { signIn } from '@/lib/auth-client'
export function GoogleSignIn({ initialError }: { initialError?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)
  return (
    <>
      <Button
        variant="outline"
        size="lg"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const result = await signIn.social({
              provider: 'google',
              callbackURL: '/',
              errorCallbackURL: '/login',
            })
            if (result.error) setError('signin')
          } catch {
            setError('signin')
          } finally {
            setBusy(false)
          }
        }}
      >
        <GoogleMark />
        {busy ? 'Connecting…' : 'Continue with Google'}
      </Button>
      {error && (
        <p role="alert" className="flex gap-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error === 'EMAIL_NOT_ALLOWED'
            ? 'Sign-in refused. Your Google account is not allowed on this instance. Contact the instance owner or try an allowed account.'
            : 'Unable to sign in. Please try again.'}
        </p>
      )}
    </>
  )
}
