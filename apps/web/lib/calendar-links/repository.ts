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
  needsReconnectSince?: Date
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
    email: String(a.email ?? storedGoogleEmail(a.idToken) ?? ''),
  }))
}
// Better Auth stores the Google id token returned by its validated OAuth exchange.
// Read identity metadata only; never serialize the token to a client.
function storedGoogleEmail(token: unknown): string | undefined {
  if (typeof token !== 'string') return
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    )
    if (typeof payload.email === 'string' && payload.email_verified === true)
      return payload.email
  } catch {
    /* Older accounts without an id token use their calendar name. */
  }
}
export async function markNeedsReconnect(
  businessId: ObjectId,
  accountId: string,
) {
  const now = new Date()
  await (
    await links()
  ).updateOne(
    { businessId, accountId, status: { $ne: 'needs_reconnect' } },
    {
      $set: {
        status: 'needs_reconnect',
        needsReconnectSince: now,
        updatedAt: now,
      },
    },
  )
  await (
    await links()
  ).updateOne(
    { businessId, accountId },
    { $set: { lastCheckedAt: now, updatedAt: now } },
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

    const now = new Date()
    await col.updateOne(
      { businessId: business._id, accountId },
      {
        $set: {
          email: account.email || primary?.summary || 'Google account',
          calendars: [...choices].sort(
            (a, b) =>
              Number(b.calendarId === first?.calendarId) -
              Number(a.calendarId === first?.calendarId),
          ),
          status: 'ok',
          lastCheckedAt: now,
          updatedAt: now,
        },
        $unset: { needsReconnectSince: '' },
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
    const moved = await repairBookingCalendar(business)
    return {
      ok: true,
      message: !first
        ? 'No writable calendar. Share a writable calendar, then Refresh.'
        : moved
          ? 'Booking calendar moved to an available writable calendar.'
          : 'Saved',
    } as const
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
              email: account.email || 'Google account',
              needsReconnectSince: now,
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
  const businesses = (await getDb()).collection<BusinessDoc>('businesses')
  const current = await businesses.findOne({
    _id: business._id,
    ownerUserId: business.ownerUserId,
  })
  if (!current) throw Error('Business no longer available.')
  const result = await businesses.updateOne(
    {
      _id: business._id,
      ownerUserId: business.ownerUserId,
      bookingCalendar: current.bookingCalendar ?? { $exists: false },
    },
    {
      $set: {
        bookingCalendar: { accountId, calendarId },
        updatedAt: new Date(),
      },
    },
  )
  await repairBookingCalendar(business)
  if (!result.matchedCount)
    throw Error('Calendar choice changed in another tab. Retry.')
}
export async function unlinkAccount(business: BusinessDoc, accountId: string) {
  await (await links()).deleteOne({ businessId: business._id, accountId })
  await repairBookingCalendar(business)
}

// Compare-and-set prevents repair from overwriting a newer selection. Both
// choose and unlink re-check after their write; availability still fails closed.
export async function repairBookingCalendar(business: BusinessDoc) {
  const col = (await getDb()).collection<BusinessDoc>('businesses')
  const current = await col.findOne({
    _id: business._id,
    ownerUserId: business.ownerUserId,
  })
  if (!current) return false
  const all = await listLinks(business._id)
  const old = current.bookingCalendar
  if (
    old &&
    all.some(
      (l) =>
        l.accountId === old.accountId &&
        l.status === 'ok' &&
        l.calendars.some((c) => c.calendarId === old.calendarId && c.writable),
    )
  )
    return false
  const candidates = [...all].sort(
    (a, b) =>
      Number(b.accountId === old?.accountId) -
      Number(a.accountId === old?.accountId),
  )
  const link = candidates.find(
    (l) => l.status === 'ok' && l.calendars.some((c) => c.writable),
  )
  const calendar = link?.calendars.find((c) => c.writable)
  await col.updateOne(
    {
      _id: business._id,
      ownerUserId: business.ownerUserId,
      bookingCalendar: old ?? { $exists: false },
    },
    link && calendar
      ? {
          $set: {
            bookingCalendar: {
              accountId: link.accountId,
              calendarId: calendar.calendarId,
            },
            updatedAt: new Date(),
          },
        }
      : { $unset: { bookingCalendar: '' }, $set: { updatedAt: new Date() } },
  )
  return Boolean(old)
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
