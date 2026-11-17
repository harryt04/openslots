import 'server-only'
import { ObjectId } from 'mongodb'
import { getDb } from '../mongo-client'
import type { BusinessDoc } from '../businesses/repository'
import {
  calendarProvider,
  CalendarAuthError,
  type CalendarProvider,
} from '../calendar'

export type Link = {
  businessId: ObjectId
  accountId: string
  email: string
  calendars: {
    calendarId: string
    name: string
    blocks: boolean
    writable: boolean
  }[]
  status: 'ok' | 'needs_reconnect'
  lastCheckedAt: Date
  createdAt: Date
  updatedAt: Date
}
const links = async () => (await getDb()).collection<Link>('calendar_links')
export async function listLinks(businessId: ObjectId) {
  return (await links()).find({ businessId }).sort({ createdAt: 1 }).toArray()
}
export async function ownedAccounts(userId: string) {
  const accounts = await (
    await getDb()
  )
    .collection('account')
    .find({
      userId: {
        $in: ObjectId.isValid(userId)
          ? [userId, new ObjectId(userId)]
          : [userId],
      },
      providerId: 'google',
    })
    .toArray()
  return accounts.map((a) => ({
    id: String(a._id),
    userId,
    email: String(a.email ?? ''),
  }))
}
export async function markNeedsReconnect(
  businessId: ObjectId,
  accountId: string,
) {
  const now = new Date()
  await (
    await links()
  ).updateOne(
    { businessId, accountId },
    { $set: { status: 'needs_reconnect', lastCheckedAt: now, updatedAt: now } },
  )
}
export async function refreshLink(
  business: BusinessDoc,
  accountId: string,
  fallbackEmail: string,
  provider?: CalendarProvider,
) {
  const account = (await ownedAccounts(business.ownerUserId)).find(
    (a) => a.id === accountId,
  )
  if (!account) throw new Error('Google account not owned by this user.')
  const col = await links()
  const previous = await col.findOne({ businessId: business._id, accountId })
  try {
    const calendars = await (
      provider ?? calendarProvider(account)
    ).listCalendars()
    const choices = calendars.map((c) => ({
      calendarId: c.id,
      name: c.summary,
      writable: ['owner', 'writer'].includes(c.accessRole ?? ''),
      blocks:
        previous?.calendars.find((p) => p.calendarId === c.id)?.blocks ??
        Boolean(c.primary || ['owner', 'writer'].includes(c.accessRole ?? '')),
    }))
    const primary = calendars.find((c) => c.primary || c.id === 'primary')
    const first =
      choices.find((c) => c.calendarId === primary?.id && c.writable) ??
      choices.find((c) => c.writable)
    if (!previous && !first)
      throw new Error(
        'No writable calendar. Share a writable calendar and retry.',
      )
    const now = new Date()
    await col.updateOne(
      { businessId: business._id, accountId },
      {
        $set: {
          email:
            account.email ||
            (primary?.id.includes('@') ? primary.id : fallbackEmail),
          calendars: choices,
          status: 'ok',
          lastCheckedAt: now,
          updatedAt: now,
        },
        $setOnInsert: { businessId: business._id, accountId, createdAt: now },
      },
      { upsert: true },
    )
    if (first)
      await (await getDb()).collection<BusinessDoc>('businesses').updateOne(
        {
          _id: business._id,
          ownerUserId: business.ownerUserId,
          bookingCalendar: { $exists: false },
        },
        {
          $set: {
            bookingCalendar: { accountId, calendarId: first.calendarId },
            updatedAt: now,
          },
        },
      )
    return { ok: true } as const
  } catch (error) {
    if (error instanceof CalendarAuthError) {
      if (!previous) {
        const now = new Date()
        await col.updateOne(
          { businessId: business._id, accountId },
          {
            $setOnInsert: {
              businessId: business._id,
              accountId,
              email: account.email || fallbackEmail,
              calendars: [],
              status: 'needs_reconnect',
              lastCheckedAt: now,
              createdAt: now,
              updatedAt: now,
            },
          },
          { upsert: true },
        )
      }
      await markNeedsReconnect(business._id, accountId)
      return { ok: false, message: 'Connection needs reconnecting.' } as const
    }
    return {
      ok: false,
      message: 'Temporary calendar problem. Please retry Refresh.',
    } as const
  }
}
export async function setBlocking(
  businessId: ObjectId,
  accountId: string,
  calendarId: string,
  blocks: boolean,
) {
  await (
    await links()
  ).updateOne(
    { businessId, accountId, 'calendars.calendarId': calendarId },
    { $set: { 'calendars.$.blocks': blocks, updatedAt: new Date() } },
  )
}
export async function chooseBookingCalendar(
  business: BusinessDoc,
  accountId: string,
  calendarId: string,
) {
  const link = await (
    await links()
  ).findOne({
    businessId: business._id,
    accountId,
    status: 'ok',
    calendars: { $elemMatch: { calendarId, writable: true } },
  })
  if (!link)
    throw new Error('Choose a writable calendar on a connected account.')
  await (await getDb()).collection<BusinessDoc>('businesses').updateOne(
    { _id: business._id, ownerUserId: business.ownerUserId },
    {
      $set: {
        bookingCalendar: { accountId, calendarId },
        updatedAt: new Date(),
      },
    },
  )
}
export async function unlinkAccount(business: BusinessDoc, accountId: string) {
  // Refuse deletion of the destination, including when a stale form is submitted.
  const current = await (
    await getDb()
  )
    .collection<BusinessDoc>('businesses')
    .findOne({ _id: business._id, ownerUserId: business.ownerUserId })
  if (current?.bookingCalendar?.accountId === accountId)
    throw new Error(
      'Choose a booking calendar on another account before unlinking.',
    )
  await (await links()).deleteOne({ businessId: business._id, accountId })
}
export async function calendarAvailability(business: BusinessDoc) {
  const unavailable = { ok: false, reason: 'calendar_unavailable' } as const
  const all = await listLinks(business._id)
  const bookingCalendar = business.bookingCalendar
  if (!all.length || !bookingCalendar) return unavailable
  const destination = all.find((l) => l.accountId === bookingCalendar.accountId)
  if (
    !destination ||
    destination.status !== 'ok' ||
    !destination.calendars.some(
      (c) => c.calendarId === bookingCalendar.calendarId && c.writable,
    )
  )
    return unavailable
  const accounts = await ownedAccounts(business.ownerUserId)
  const calendars = []
  for (const link of all) {
    if (!accounts.some((a) => a.id === link.accountId)) return unavailable
    if (link.status !== 'ok' && link.calendars.some((c) => c.blocks))
      return unavailable
    for (const c of link.calendars.filter((c) => c.blocks))
      calendars.push({
        accountId: link.accountId,
        userId: business.ownerUserId,
        calendarId: c.calendarId,
      })
  }
  return { ok: true, calendars, bookingCalendar } as const
}
