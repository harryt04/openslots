'use client'
import { useState, useTransition } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateDeveloperSettings } from './actions'

export function Settings({
  publishableKey,
  origins,
  host,
}: {
  publishableKey: string
  origins: string[]
  host: string
}) {
  const [origin, setOrigin] = useState('')
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [pending, start] = useTransition()
  function save(action: 'rotate' | 'add' | 'remove', value = '') {
    start(async () => {
      const result = await updateDeveloperSettings(action, value)
      setMessage(result.error || 'Saved')
      if (!result.error) {
        setConfirm(false)
        setOrigin('')
      }
    })
  }
  const snippet = `import { BookingFlow } from '@openslots/react'\nimport '@openslots/react/styles.css'\n\nexport default function Book() {\n  return <BookingFlow\n  host="${host}"\n  publishableKey="${publishableKey}"\n  />\n}`
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Publishable key</h2>
          <div className="flex gap-2">
            <Input
              aria-label="Publishable key"
              className="font-mono"
              readOnly
              value={publishableKey}
            />
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(publishableKey)
                setMessage('Key copied')
              }}
            >
              Copy
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Safe to ship in browser code. Keep manage links private.
          </p>
          <Button variant="outline" onClick={() => setConfirm(true)}>
            Rotate key
          </Button>
          <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rotate publishable key?</AlertDialogTitle>
                <AlertDialogDescription>
                  The old key stops working at once. Update every embed after
                  rotating.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <Button disabled={pending} onClick={() => save('rotate')}>
                  Confirm rotation
                </Button>
                <AlertDialogCancel>Keep current key</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
        <section className="space-y-4 rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Allowed sites</h2>
          <p className="text-sm text-muted-foreground">
            This install is always allowed. Add each site that embeds your
            picker.
          </p>
          <ul className="space-y-2">
            {origins.map((site) => (
              <li
                key={site}
                className="flex items-center justify-between gap-2"
              >
                <code className="font-mono text-sm break-all">{site}</code>
                <Button
                  variant="outline"
                  disabled={pending}
                  aria-label={`Remove ${site}`}
                  onClick={() => save('remove', site)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              save('add', origin)
            }}
          >
            <Input
              aria-label="Site origin"
              placeholder="https://example.com"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            />
            <Button disabled={pending}>Add site</Button>
          </form>
        </section>
      </div>
      <section className="space-y-4 rounded-xl border bg-card p-6">
        <h2 className="font-semibold">Install and embed</h2>
        <pre className="overflow-auto rounded-lg bg-code p-4 font-mono text-sm text-code-foreground">
          pnpm add @openslots/react
        </pre>
        <pre className="overflow-auto rounded-lg bg-code p-4 font-mono text-sm text-code-foreground">
          <code>{snippet}</code>
        </pre>
        <Button
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(snippet)
            setMessage('Snippet copied')
          }}
        >
          Copy snippet
        </Button>
      </section>
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  )
}
