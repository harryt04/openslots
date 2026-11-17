import { handle } from '@/lib/public-api/handler'

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return handle(request, 'reschedule', (await context.params).token)
}
export async function OPTIONS(request: Request) {
  return handle(request, 'reschedule')
}

export const GET = POST

export const PUT = POST

export const PATCH = POST

export const DELETE = POST

export const HEAD = POST
