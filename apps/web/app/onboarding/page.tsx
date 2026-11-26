import type { Metadata } from 'next'

import { BusinessForm } from '@/components/custom/business-form'
import { Logo } from '@/components/custom/logo'
import { createBusinessAction } from '@/app/actions/business'
import { listBusinessesForUser } from '@/lib/businesses/repository'
import { requireSession } from '@/lib/session'

export const metadata: Metadata = { title: 'Name your business' }

/**
 * S1-3: the step after first sign-in. Also reached from the business
 * switcher to add another business (then it offers Cancel).
 */
export default async function OnboardingPage() {
  const session = await requireSession()
  const existing = await listBusinessesForUser(session.user.id)
  const first = existing.length === 0

  return (
    <main
      data-agent-hidden=""
      className="grid min-h-screen place-content-center p-6"
    >
      <div className="grid w-full max-w-md gap-6">
        <Logo />
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
            {first ? 'Name your business' : 'Add a business'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {first
              ? 'This is what customers see on your booking page. You can change it later.'
              : 'Each business has its own services, hours, calendars and keys.'}
          </p>
        </div>
        <BusinessForm
          suggest
          submitLabel={first ? 'Create business' : 'Add business'}
          action={createBusinessAction}
          cancelHref={first ? undefined : '/'}
        />
      </div>
    </main>
  )
}
