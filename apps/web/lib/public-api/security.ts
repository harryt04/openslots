import { createHash, randomBytes } from 'node:crypto'
import { API_ERROR_STATUS, type ApiErrorCode } from '@openslots/core'

export class ApiFailure extends Error {
  constructor(
    public code: ApiErrorCode,
    message?: string,
  ) {
    super(message ?? code.replaceAll('_', ' '))
  }
}
export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex')
export const generateManageToken = () => randomBytes(32).toString('base64url')
export function normalizeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value)
    return (url.pathname === '/' || url.pathname === '') &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      ? url.origin
      : undefined
  } catch {
    return undefined
  }
}
export const validOrigin = (value: string) => normalizeOrigin(value) === value

export function errorResponse(error: unknown) {
  const code = error instanceof ApiFailure ? error.code : 'internal_error'
  return Response.json(
    {
      error: {
        code,
        message:
          error instanceof ApiFailure
            ? error.message
            : code.replaceAll('_', ' '),
      },
    },
    { status: API_ERROR_STATUS[code] },
  )
}
