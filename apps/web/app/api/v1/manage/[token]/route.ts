import { handle } from '@/lib/public-api/handler'

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return handle(request, 'manage', (await context.params).token)
}
export async function OPTIONS(request: Request) {
  return handle(request, 'manage')
}
