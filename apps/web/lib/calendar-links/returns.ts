import 'server-only'
import { randomBytes } from 'node:crypto'
import type { ObjectId } from 'mongodb'
import { getDb } from '../mongo-client'
import type { BusinessDoc } from '../businesses/repository'
import { ownedAccounts, refreshLink } from './repository'
type Intent = {
  nonce: string
  userId: string
  businessId: ObjectId
  accountId?: string
  snapshot: string[]
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}
export async function beginReturn(
  business: BusinessDoc,
  userId: string,
  accountId?: string,
) {
  const accounts = await ownedAccounts(userId)
  if (accountId && !accounts.some((a) => a.id === accountId))
    throw Error('Account not owned')
  const nonce = randomBytes(32).toString('base64url')
  const now = new Date()
  await (await getDb()).collection<Intent>('calendar_link_returns').insertOne({
    nonce,
    userId,
    businessId: business._id,
    accountId,
    snapshot: accounts.map((a) => a.id),
    expiresAt: new Date(Date.now() + 600000),
    createdAt: now,
    updatedAt: now,
  })
  return nonce
}
export async function finishReturn(
  business: BusinessDoc,
  userId: string,
  nonce: string,
) {
  const intent = await (
    await getDb()
  )
    .collection<Intent>('calendar_link_returns')
    .findOneAndDelete({
      nonce,
      userId,
      businessId: business._id,
      expiresAt: { $gt: new Date() },
    })
  if (!intent) return
  const accounts = await ownedAccounts(userId)
  const candidates = intent.accountId
    ? accounts.filter((a) => a.id === intent.accountId)
    : accounts.filter((a) => !intent.snapshot.includes(a.id))
  // Say why nothing was connected, so a silent return is not mistaken for
  // success.
  if (candidates.length === 0)
    return {
      ok: false,
      message: intent.accountId
        ? 'That Google account is no longer linked to your sign-in. Link it again.'
        : 'That Google account was already yours. Use Connect beside it to add it to this business.',
    } as const
  if (candidates.length > 1)
    return {
      ok: false,
      message:
        'Several Google accounts were added at once. Use Connect beside the one you want.',
    } as const
  try {
    return await refreshLink(business, candidates[0]!.id, '')
  } catch {
    return {
      ok: false,
      message:
        'The account was added, but its calendars could not be read. Try Refresh.',
    } as const
  }
}
