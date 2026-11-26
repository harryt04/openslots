'use client'
import { Info } from 'lucide-react'
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
  const [messageAt, setMessageAt] = useState<'key' | 'origin' | 'snippet'>(
    'key',
  )
  const status = (at: typeof messageAt) =>
    message && messageAt === at ? (
      <p role="status" className="flex items-start gap-2 text-sm">
        <Info className="size-4 shrink-0" aria-hidden="true" />
        {message}
      </p>
    ) : null
  const [confirm, setConfirm] = useState(false)
  const [pending, start] = useTransition()
  function save(action: 'rotate' | 'add' | 'remove', value = '') {
    start(async () => {
      const result = await updateDeveloperSettings(action, value)
      setMessageAt(action === 'rotate' ? 'key' : 'origin')
      setMessage(result.error || result.message || 'Saved')
      if (!result.error) {
        setConfirm(false)
        setOrigin('')
      }
    })
  }
  const snippet = `import { BookingFlow } from '@openslots/react'\nimport '@openslots/react/styles.css'\n\nexport default function Book() {\n  return <BookingFlow\n  host="${host}"\n  publishableKey="${publishableKey}"\n  />\n}`
  return (
    <div
      data-agent-hidden=""
      data-agent-secret=""
      className="grid min-w-0 gap-6 lg:grid-cols-2"
    >
      <div className="min-w-0 space-y-6">
        <section className="min-w-0 space-y-4 rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Publishable key</h2>
          <div className="flex gap-2">
            <Input
              aria-label="Publishable key"
              className="min-w-0 font-mono"
              readOnly
              value={publishableKey}
            />
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(publishableKey)
                setMessageAt('key')
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
          {status('key')}
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
        <section className="min-w-0 space-y-4 rounded-xl border bg-card p-6">
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
              onValueChange={setOrigin}
            />
            <Button disabled={pending}>Add site</Button>
          </form>
          {status('origin')}
        </section>
      </div>
      <section className="min-w-0 space-y-4 rounded-xl border bg-card p-6">
        <h2 className="font-semibold">Install and embed</h2>
        <pre className="max-w-full overflow-auto rounded-lg bg-code p-4 font-mono text-sm text-code-foreground">
          pnpm add @openslots/react
        </pre>
        <pre className="max-w-full overflow-auto rounded-lg bg-code p-4 font-mono text-sm text-code-foreground">
          <code>{snippet}</code>
        </pre>
        <Button
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(snippet)
            setMessageAt('snippet')
            setMessage('Snippet copied')
          }}
        >
          Copy snippet
        </Button>
        {status('snippet')}
      </section>
    </div>
  )
}
