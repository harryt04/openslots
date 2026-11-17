'use server'
import { revalidatePath } from 'next/cache'
import { requireBusiness } from '@/lib/businesses/current'
import { generatePublishableKey } from '@/lib/businesses/keys'
import { getDb } from '@/lib/mongo-client'
import { normalizeOrigin } from '@/lib/public-api/security'

export async function updateDeveloperSettings(
  action: 'rotate' | 'add' | 'remove',
  origin = '',
) {
  const { business, session } = await requireBusiness()
  const normalized = normalizeOrigin(origin)
  if (action !== 'rotate' && !normalized)
    return {
      error:
        'Enter an origin with scheme and host, no path. Use HTTPS (HTTP is allowed only for localhost).',
    }
  const filter = { _id: business._id, ownerUserId: session.user.id }
  const col = (await getDb()).collection('businesses')
  if (action === 'rotate')
    await col.updateOne(filter, {
      $set: { publishableKey: generatePublishableKey(), updatedAt: new Date() },
    })
  if (action === 'add')
    await col.updateOne(filter, {
      $addToSet: { allowedOrigins: normalized },
      $set: { updatedAt: new Date() },
    })
  if (action === 'remove')
    await col.updateOne(filter, {
      $pull: { allowedOrigins: normalized } as never,
      $set: { updatedAt: new Date() },
    })
  revalidatePath('/developers')
  return {
    error: '',
    message:
      action === 'add'
        ? `Stored ${normalized}`
        : action === 'rotate'
          ? 'Key rotated'
          : 'Site removed',
  }
}
