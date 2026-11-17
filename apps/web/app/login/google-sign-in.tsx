'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { signIn } from '@/lib/auth-client'
export function GoogleSignIn() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
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
              errorCallbackURL: '/login?error=signin',
            })
            if (result.error) setError(true)
          } catch {
            setError(true)
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Connecting…' : 'Continue with Google'}
      </Button>
      {error && (
        <p role="alert">
          Unable to sign in. Your account may not be allowed on this instance.
        </p>
      )}
    </>
  )
}
