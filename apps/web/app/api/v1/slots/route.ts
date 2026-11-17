import { handle } from '@/lib/public-api/handler'

export async function GET(request: Request) {
  return handle(request, 'slots')
}
export async function OPTIONS(request: Request) {
  return handle(request, 'slots')
}
