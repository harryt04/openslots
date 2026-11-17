import { createHash, randomBytes } from 'node:crypto'
import { API_ERROR_STATUS, type ApiErrorCode } from '@openslots/core'

export class ApiFailure extends Error {
  constructor(public code: ApiErrorCode) {
    super(code.replaceAll('_', ' '))
  }
}
export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex')
export const generateManageToken = () => randomBytes(32).toString('base64url')
export function validOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.origin === value &&
      !url.username &&
      !url.password &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    )
  } catch {
    return false
  }
}
export function errorResponse(error: unknown) {
  const code = error instanceof ApiFailure ? error.code : 'internal_error'
  return Response.json(
    { error: { code, message: code.replaceAll('_', ' ') } },
    { status: API_ERROR_STATUS[code] },
  )
}
