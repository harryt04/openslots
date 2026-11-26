'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn, signUp } from '@/lib/auth-client'

// A fixed password is fine here: this page only exists when
// E2E_FAKE_GOOGLE=1, which the server refuses in production.
const TEST_PASSWORD = 'openslots-test-password'

export function TestSignIn() {
  const router = useRouter()
  const [email, setEmail] = useState('owner@example.test')
  const [name, setName] = useState('Jordan Lee')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const signedIn = await signIn.email({ email, password: TEST_PASSWORD })
      const failure = signedIn.error
        ? (await signUp.email({ email, name, password: TEST_PASSWORD })).error
        : null
      if (failure) {
        setError(failure.message ?? 'Sign-in failed.')
        return
      }
      router.push('/')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      data-agent-hidden=""
      data-agent-secret=""
      onSubmit={handleSubmit}
      className="grid w-80 gap-4"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Test sign-in</h1>
        <p className="text-sm text-muted-foreground">
          Fake mode only. Signs in as this user, creating it if needed.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onValueChange={setEmail}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" required value={name} onValueChange={setName} />
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
