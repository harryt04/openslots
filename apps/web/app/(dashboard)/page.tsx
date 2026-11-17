import { requireSession } from '@/lib/session'

// Placeholder home. The bookings dashboard (S2) replaces it in slice 4B.
export default async function Home() {
  const { user } = await requireSession()

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <p className="text-lg font-medium">Welcome, {user.name || user.email}</p>
    </div>
  )
}
