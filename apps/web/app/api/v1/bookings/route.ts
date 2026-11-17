import { handle } from '@/lib/public-api/handler'

export async function POST(request: Request) {
  return handle(request, 'bookings')
}
export async function OPTIONS(request: Request) {
  return handle(request, 'bookings')
}

export const GET = POST

export const PUT = POST

export const PATCH = POST

export const DELETE = POST

export const HEAD = POST
