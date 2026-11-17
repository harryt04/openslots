'use client'

import '@openslots/react/styles.css'

import {
  BookingFlow,
  createClient,
  ServiceList,
  SlotPicker,
  useBusiness,
  useSlots,
  type PublicService,
  type SelectedSlot,
} from '@openslots/react'
import {
  BookingFlowAt,
  createMockApi,
  MOCK_HOST,
  MOCK_KEY,
  MOCK_SERVICES,
  type BookingFlowInitialState,
  type MockScenario,
} from '@openslots/react/testing'
import { addDays, localDateOf } from '@openslots/core'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { Logo } from '@/components/custom/logo'
import { ThemeSwitcher } from '@/components/custom/theme-switcher'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { HostFrame } from './host-frame'

const CUT = MOCK_SERVICES[1]!

type StateId =
  | 'loading'
  | 'loaded'
  | 'no-slots'
  | 'calendar-unavailable'
  | 'slot-taken'
  | 'validation'
  | 'booking-error'
  | 'success'

const STATES: {
  id: StateId
  label: string
  scenario: MockScenario
  /** Where the flow starts. Absent: the beginning. */
  at?: 'time' | 'details' | 'validation' | 'done'
}[] = [
  { id: 'loading', label: 'Loading', scenario: 'loading' },
  { id: 'loaded', label: 'Loaded', scenario: 'loaded' },
  { id: 'no-slots', label: 'No slots', scenario: 'no_slots', at: 'time' },
  {
    id: 'calendar-unavailable',
    label: 'calendar_unavailable',
    scenario: 'calendar_unavailable',
    at: 'time',
  },
  {
    id: 'slot-taken',
    label: 'Slot taken on submit',
    scenario: 'slot_taken',
    at: 'details',
  },
  {
    id: 'validation',
    label: 'Validation errors',
    scenario: 'loaded',
    at: 'validation',
  },
  {
    id: 'booking-error',
    label: 'Booking error',
    scenario: 'booking_rate_limited',
    at: 'details',
  },
  { id: 'success', label: 'Success', scenario: 'loaded', at: 'done' },
]

/** A mock API for one frame, with a little latency so loading is visible. */
function useMockApi(scenario: MockScenario) {
  const [api] = useState(() => createMockApi({ scenario, latencyMs: 250 }))
  return api
}

/** The first open slot of the mock salon, for states that start mid-flow. */
function useFirstSlot(): string | null {
  const [start, setStart] = useState<string | null>(null)
  useEffect(() => {
    const api = createMockApi()
    const client = createClient({
      host: MOCK_HOST,
      publishableKey: MOCK_KEY,
      fetch: api.fetch,
    })
    const tz = 'America/Denver'
    const from = localDateOf(new Date(), tz)
    client
      .getSlots({ service: CUT.id, from, to: addDays(from, 60), tz })
      .then((slots) => setStart(Object.values(slots.days)[0]?.[0] ?? null))
      .catch(() => setStart(null))
  }, [])
  return start
}

function initialFor(
  at: (typeof STATES)[number]['at'],
  start: string | null,
): BookingFlowInitialState | null {
  if (!at) return null
  if (at === 'time') return { step: 'time', serviceId: CUT.id }
  if (!start) return null
  const draft = { name: 'Alex Morgan', email: 'alex@example.com' }
  if (at === 'details')
    return { step: 'details', serviceId: CUT.id, start, draft }
  if (at === 'validation') {
    return {
      step: 'details',
      serviceId: CUT.id,
      start,
      draft: { name: '', email: 'alex@example' },
      showErrors: true,
    }
  }
  return {
    step: 'done',
    serviceId: CUT.id,
    start,
    draft,
    booking: {
      id: '64c000000000000000000001',
      start,
      end: new Date(Date.parse(start) + CUT.durationMin * 60_000).toISOString(),
      manageUrl: `${MOCK_HOST}/m/mock-manage-token-aaaaaaaaaaaaaaaaaaaaaaaaa`,
    },
  }
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={`${id}-h`}
      className="grid gap-3"
      data-section={id}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="rounded-[5px] bg-primary px-[7px] py-0.5 font-mono text-[11px] font-medium text-primary-foreground">
          {id}
        </span>
        <h2 id={`${id}-h`} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {note ? (
          <span className="text-sm text-muted-foreground">{note}</span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-1.5 border-b bg-muted px-3 py-2">
        <b className="size-[9px] rounded-full bg-input" />
        <b className="size-[9px] rounded-full bg-input" />
        <b className="size-[9px] rounded-full bg-input" />
        <span className="ml-2.5 truncate rounded-md border bg-card px-2.5 font-mono text-[11px] text-muted-foreground">
          {url}
        </span>
      </div>
      {children}
    </div>
  )
}

function FlowStates() {
  const [state, setState] = useState<StateId>('loaded')
  const firstSlot = useFirstSlot()

  return (
    <Section
      id="S8"
      title="BookingFlow"
      note="the hosted page's frame, one state at a time"
    >
      <div className="grid gap-1.5">
        <Label id="state-label">State</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby="state-label"
          value={state}
          onValueChange={(v) => v && setState(v as StateId)}
          className="flex-wrap"
        >
          {STATES.map((s) => (
            <ToggleGroupItem
              key={s.id}
              value={s.id}
              className="px-3 font-mono text-xs"
            >
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <BrowserFrame url="slots.example.com/b/shear-bliss">
        <div
          className="px-5 py-7"
          style={{
            background:
              'radial-gradient(700px 300px at 50% 0, var(--primary-soft), transparent 70%), var(--background)',
          }}
        >
          <div className="mx-auto max-w-[880px]" data-testid="flow-frame">
            <FlowState key={state} state={state} firstSlot={firstSlot} />
            <p className="mt-3.5 text-center text-xs text-muted-foreground">
              Powered by OpenSlots · free and open source
            </p>
          </div>
        </div>
      </BrowserFrame>
    </Section>
  )
}

function FlowState({
  state,
  firstSlot,
}: {
  state: StateId
  firstSlot: string | null
}) {
  const config = STATES.find((s) => s.id === state)!
  const api = useMockApi(config.scenario)
  const initial = initialFor(config.at, firstSlot)
  const connection = {
    host: MOCK_HOST,
    publishableKey: MOCK_KEY,
    fetch: api.fetch,
  }
  if (config.at && config.at !== 'time' && !initial) {
    return <p className="text-sm text-muted-foreground">Preparing state…</p>
  }
  return initial ? (
    <BookingFlowAt {...connection} initial={initial} />
  ) : (
    <BookingFlow {...connection} />
  )
}

function ResizableFrame() {
  const [width, setWidth] = useState(900)
  const api = useMockApi('loaded')
  return (
    <Section
      id="S9-1"
      title="Container query"
      note="three columns at 760px of the component's own width, stacked below"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="frame-width">Component width</Label>
        <input
          id="frame-width"
          type="range"
          min={300}
          max={1100}
          step={10}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-64 accent-primary"
        />
        <output
          htmlFor="frame-width"
          className="font-mono text-sm"
          data-testid="frame-width"
        >
          {width}px
        </output>
      </div>
      <div className="overflow-x-auto rounded-xl border border-dashed p-3">
        <div style={{ width }} data-testid="resizable-frame">
          <BookingFlow
            host={MOCK_HOST}
            publishableKey={MOCK_KEY}
            fetch={api.fetch}
            service="cut-and-style"
          />
        </div>
      </div>
    </Section>
  )
}

function PhoneFrame() {
  const api = useMockApi('loaded')
  return (
    <Section id="S9" title="Phone" note="the same component at 340px">
      <div
        className="w-[340px] max-w-full overflow-hidden rounded-[36px] border-8 border-foreground bg-background"
        data-testid="phone-frame"
      >
        <BookingFlow
          host={MOCK_HOST}
          publishableKey={MOCK_KEY}
          fetch={api.fetch}
          service="cut-and-style"
          className="[&>div]:!rounded-none [&>div]:!border-0"
        />
      </div>
    </Section>
  )
}

function EmbeddedFrame() {
  const api = useMockApi('loaded')
  return (
    <Section
      id="C1"
      title="BookingFlow embedded in another app"
      note="hostile host CSS, no app styles, only @openslots/react/styles.css"
    >
      <BrowserFrame url="shearbliss.example/book">
        <HostFrame title="Pretend host page">
          <BookingFlow
            host={MOCK_HOST}
            publishableKey={MOCK_KEY}
            fetch={api.fetch}
          />
        </HostFrame>
      </BrowserFrame>
    </Section>
  )
}

function StandaloneParts() {
  const api = useMockApi('loaded')
  const connection = {
    host: MOCK_HOST,
    publishableKey: MOCK_KEY,
    fetch: api.fetch,
  }
  const [service, setService] = useState<PublicService>(CUT)
  const [slot, setSlot] = useState<SelectedSlot | null>(null)
  return (
    <Section id="C1 exports" title="SlotPicker, ServiceList and the hooks">
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          <h3 className="text-sm font-medium">{'<ServiceList onSelect>'}</h3>
          <ServiceList
            {...connection}
            selected={service.id}
            onSelect={setService}
          />
        </div>
        <div className="grid content-start gap-2">
          <h3 className="text-sm font-medium">
            {'<SlotPicker service value onChange timezone?>'}
          </h3>
          <SlotPicker
            {...connection}
            service={service}
            value={slot?.start ?? null}
            onChange={setSlot}
          />
          <pre
            className="overflow-x-auto rounded-lg bg-code p-3 font-mono text-xs text-code-foreground"
            data-testid="picked-slot"
          >
            {JSON.stringify(slot, null, 2) ?? 'null'}
          </pre>
        </div>
      </div>
      <HooksDemo connection={connection} serviceId={service.id} />
    </Section>
  )
}

function HooksDemo({
  connection,
  serviceId,
}: {
  connection: { host: string; publishableKey: string; fetch: typeof fetch }
  serviceId: string
}) {
  const business = useBusiness(connection)
  const tz = business.data?.timezone
  const from = useMemo(() => (tz ? localDateOf(new Date(), tz) : null), [tz])
  const slots = useSlots({
    ...connection,
    service: serviceId,
    from,
    to: from ? addDays(from, 13) : null,
    timezone: tz,
  })
  const summary = {
    useBusiness: business.loading
      ? 'loading'
      : { name: business.data?.name, services: business.data?.services.length },
    useSlots: slots.loading
      ? 'loading'
      : Object.fromEntries(
          Object.entries(slots.data?.days ?? {}).map(([d, s]) => [d, s.length]),
        ),
  }
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">
        {'useBusiness() and useSlots({ service, from, to })'}
      </h3>
      <pre className="max-h-56 overflow-auto rounded-lg bg-code p-3 font-mono text-xs text-code-foreground">
        {JSON.stringify(summary, null, 2)}
      </pre>
    </div>
  )
}

export function Gallery() {
  return (
    <main className="mx-auto grid max-w-6xl gap-12 p-8">
      <header className="flex items-center justify-between gap-4">
        <div className="grid gap-1">
          <Logo />
          <h1 className="text-2xl font-semibold tracking-tight">
            Component gallery
          </h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Every <span className="font-mono">@openslots/react</span> export
            against an in-memory mock of the public API, with the design
            spec&apos;s salon data. Compare with sections 04 and 05 of the spec.
          </p>
        </div>
        <ThemeSwitcher />
      </header>
      <FlowStates />
      <div className="grid gap-12 lg:grid-cols-[auto_minmax(0,1fr)]">
        <PhoneFrame />
        <EmbeddedFrame />
      </div>
      <ResizableFrame />
      <StandaloneParts />
    </main>
  )
}
