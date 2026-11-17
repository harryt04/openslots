import { handle } from '@/lib/public-api/handler'

export async function POST(request: Request) {
  return handle(request, 'bookings')
}
export async function OPTIONS(request: Request) {
  return handle(request, 'bookings')
}
