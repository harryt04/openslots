'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import {
  CURRENT_BUSINESS_COOKIE,
  requireBusiness,
} from '@/lib/businesses/current'
import {
  createBusiness,
  getBusinessForUser,
  updateBusinessForUser,
} from '@/lib/businesses/repository'
import {
  businessInputSchema,
  type ActionResult,
  type BusinessInput,
} from '@/lib/businesses/schema'
import { requireSession } from '@/lib/session'

const SLUG_TAKEN = 'That address is already taken. Try another.'

function parse(raw: unknown): { data: BusinessInput } | ActionResult {
  const parsed = businessInputSchema.safeParse(raw)
  if (parsed.success) return { data: parsed.data }
  const fieldErrors: Partial<Record<keyof BusinessInput, string>> = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof BusinessInput
    fieldErrors[key] ??= issue.message
  }
  return { ok: false, fieldErrors }
}

async function remember(businessId: string) {
  ;(await cookies()).set(CURRENT_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}

/** Onboarding and "add a business" from the switcher. */
export async function createBusinessAction(
  raw: unknown,
): Promise<ActionResult> {
  const session = await requireSession()
  const parsed = parse(raw)
  if (!('data' in parsed)) return parsed
  const result = await createBusiness(session.user.id, parsed.data)
  if (!result.ok) return { ok: false, fieldErrors: { slug: SLUG_TAKEN } }
  await remember(result.business._id.toHexString())
  revalidatePath('/', 'layout')
  return { ok: true, redirectTo: '/availability' }
}

/** Edit the current business. */
export async function updateBusinessAction(
  raw: unknown,
): Promise<ActionResult> {
  const { session, business } = await requireBusiness()
  const parsed = parse(raw)
  if (!('data' in parsed)) return parsed
  const result = await updateBusinessForUser(
    session.user.id,
    business._id.toHexString(),
    parsed.data,
  )
  if (!result.ok) {
    return result.error === 'slug_taken'
      ? { ok: false, fieldErrors: { slug: SLUG_TAKEN } }
      : { ok: false, message: 'Business not found.' }
  }
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Switch the current business. Only businesses the user owns are accepted. */
export async function switchBusinessAction(businessId: string) {
  const session = await requireSession()
  const owned = await getBusinessForUser(session.user.id, String(businessId))
  if (owned) {
    await remember(owned._id.toHexString())
  }
  revalidatePath('/', 'layout')
  redirect('/')
}
