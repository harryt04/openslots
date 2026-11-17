import type { Metadata } from 'next'

import { Logo } from '@/components/custom/logo'
import { StatusBadge, type Status } from '@/components/custom/status-badge'
import { ThemeSwitcher } from '@/components/custom/theme-switcher'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const metadata: Metadata = { title: 'Tokens' }

const swatches = [
  ['primary', 'bg-primary', 'actions, selected day, nav'],
  ['accent', 'bg-accent-strong', 'chosen slot, key CTA'],
  ['highlight', 'bg-highlight', 'needs attention'],
  ['primary-soft', 'bg-primary-soft', 'available day, hover'],
  ['accent-soft', 'bg-accent-soft', 'quiet emphasis'],
  ['muted', 'bg-muted', 'quiet surfaces'],
  ['background', 'bg-background', 'tinted, never pure white'],
  ['card', 'bg-card', 'raised surfaces'],
  ['sidebar', 'bg-sidebar', 'navigation'],
  ['destructive', 'bg-destructive', 'irreversible actions'],
] as const

const serviceColors = [
  ['blue', 'bg-svc-blue'],
  ['orange', 'bg-svc-orange'],
  ['sky', 'bg-svc-sky'],
  ['vermillion', 'bg-svc-vermillion'],
  ['pink', 'bg-svc-pink'],
  ['yellow', 'bg-svc-yellow'],
] as const

const statuses: Status[] = [
  'confirmed',
  'connected',
  'extra-day',
  'rescheduled',
  'pending',
  'short-day',
  'needs-reconnect',
  'paused',
  'cancelled',
  'closed',
]

/**
 * The Voltage tokens and base primitives on one page, for checking T-1 to
 * T-6 in light and dark against section 02 of the design spec.
 */
export default function Tokens() {
  return (
    <main className="mx-auto grid max-w-5xl gap-8 p-8">
      <header className="flex items-center justify-between">
        <Logo />
        <ThemeSwitcher />
      </header>

      <section aria-labelledby="colors" className="grid gap-3">
        <h1 id="colors" className="text-2xl font-semibold tracking-tight">
          Look and color
        </h1>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
          {swatches.map(([name, className, use]) => (
            <li
              key={name}
              className="overflow-hidden rounded-lg border bg-card"
            >
              <div className={`h-14 border-b ${className}`} />
              <p className="px-2.5 py-1.5 text-xs font-medium">
                {name}
                <span className="block font-mono text-[11px] font-normal text-muted-foreground">
                  {use}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Service colors (fixed, both modes)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {serviceColors.map(([name, className]) => (
              <Badge key={name} variant="outline" className="rounded-full">
                <span className={`size-2.5 rounded-xs ${className}`} />
                {name}
              </Badge>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Status is icon and word, never color alone</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Primitives</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button className="bg-accent-strong text-accent-strong-foreground hover:bg-accent-strong/90">
              Key action
            </Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Tabs defaultValue="upcoming">
              <TabsList>
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="past">Past</TabsTrigger>
                <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <Switch id="bookable" defaultChecked />
              <Label htmlFor="bookable">Bookable</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="paused" />
              <Label htmlFor="paused">Paused</Label>
            </div>
          </div>
          <div className="grid max-w-sm gap-1.5">
            <Label htmlFor="sample">Name</Label>
            <Input id="sample" defaultValue="Full color" />
            <p className="text-xs text-muted-foreground">
              Hint text in muted-foreground.
            </p>
          </div>
          <p>
            Geist for UI.{' '}
            <span className="font-mono text-xs">
              Geist Mono for 1:30 – 2:30 PM, 180m, os_pk_… and code.
            </span>
          </p>
          <pre className="overflow-x-auto rounded-lg bg-code p-4 font-mono text-xs leading-relaxed text-code-foreground">
            <span className="text-code-comment"># in your other project</span>
            {'\n'}pnpm add @openslots/react{'\n'}
            <span className="text-code-keyword">import</span> {'{ '}
            <span className="text-code-type">BookingFlow</span>
            {' } '}
            <span className="text-code-keyword">from</span>{' '}
            <span className="text-code-string">
              &quot;@openslots/react&quot;
            </span>
          </pre>
        </CardContent>
      </Card>
    </main>
  )
}
