import type { ApiErrorCode } from '@openslots/core'

/**
 * Every way a request can fail: the API's error codes (docs/TRD.md section
 * 7), plus `network_error` when the server could not be reached and
 * `invalid_response` when it answered with something outside the contract.
 */
export type OpenSlotsErrorCode =
  ApiErrorCode | 'network_error' | 'invalid_response'

/** The one error type the client throws. */
export class OpenSlotsError extends Error {
  readonly code: OpenSlotsErrorCode
  /** HTTP status, when the server answered. */
  readonly status: number | undefined

  constructor(
    code: OpenSlotsErrorCode,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'OpenSlotsError'
    this.code = code
    this.status = options.status
  }
}

export function isOpenSlotsError(error: unknown): error is OpenSlotsError {
  return error instanceof OpenSlotsError
}

/** True for the error `fetch` throws when its signal is aborted. */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * A sentence a customer can act on, for each code. Components show these
 * rather than the server's message, which is written for developers.
 */
export function customerMessage(error: unknown): string {
  const code = isOpenSlotsError(error) ? error.code : 'internal_error'
  switch (code) {
    case 'slot_taken':
      return 'Sorry, someone booked that time a moment ago. Please choose another time.'
    case 'calendar_unavailable':
      return "Online booking is paused because the business's calendar can't be reached. Please try again later."
    case 'rate_limited':
      return 'Too many attempts in a short time. Please wait a minute and try again.'
    case 'network_error':
      return "We couldn't connect. Check your internet connection and try again."
    case 'invalid_request':
      return 'Some details were not accepted. Check the form and try again.'
    case 'not_found':
      return 'This service or booking is no longer available.'
    case 'booking_not_changeable':
      return 'This booking can no longer be changed.'
    case 'invalid_key':
    case 'origin_not_allowed':
      return "Online booking isn't set up correctly on this site. Please contact the business."
    case 'invalid_response':
    case 'internal_error':
      return 'Something went wrong on our side. Please try again.'
  }
}
