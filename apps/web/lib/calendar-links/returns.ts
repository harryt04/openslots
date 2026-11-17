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
  if (candidates.length !== 1) return
  return refreshLink(business, candidates[0]!.id, '')
}
