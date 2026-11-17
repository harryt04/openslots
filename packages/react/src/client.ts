import {
  API_ERROR_STATUS,
  apiErrorSchema,
  businessResponseSchema,
  createBookingBodySchema,
  createBookingResponseSchema,
  manageSummarySchema,
  manageTokenSchema,
  PUBLISHABLE_KEY_HEADER,
  rescheduleBodySchema,
  slotsQuerySchema,
  slotsResponseSchema,
  type ApiErrorCode,
  type BusinessResponse,
  type CreateBookingBody,
  type CreateBookingResponse,
  type ManageSummary,
  type RescheduleBody,
  type SlotsQuery,
  type SlotsResponse,
} from '@openslots/core'

import { isAbortError, OpenSlotsError } from './errors'

export interface ClientOptions {
  /** The OpenSlots instance, for example `https://slots.example.com`. */
  host: string
  /** The business's publishable key, `os_pk_…`. */
  publishableKey: string
  /**
   * The `fetch` to use. Defaults to the global one; pass your own for tests
   * or for server code.
   */
  fetch?: typeof fetch
}

export interface RequestOptions {
  signal?: AbortSignal
}

/** A typed client for the public API v1 (docs/TRD.md section 7). */
export interface OpenSlotsClient {
  readonly host: string
  /** `GET /business`: name, timezone and active services. */
  getBusiness(options?: RequestOptions): Promise<BusinessResponse>
  /** `GET /slots`: open start times grouped by date in `tz`. */
  getSlots(query: SlotsQuery, options?: RequestOptions): Promise<SlotsResponse>
  /** `POST /bookings`. Throws `slot_taken` if the time is no longer open. */
  createBooking(
    body: CreateBookingBody,
    options?: RequestOptions,
  ): Promise<CreateBookingResponse>
  /** `GET /manage/:token`. */
  getBooking(token: string, options?: RequestOptions): Promise<ManageSummary>
  /** `POST /manage/:token/cancel`. */
  cancelBooking(token: string, options?: RequestOptions): Promise<ManageSummary>
  /** `POST /manage/:token/reschedule`. */
  rescheduleBooking(
    token: string,
    body: RescheduleBody,
    options?: RequestOptions,
  ): Promise<ManageSummary>
}

const STATUS_TO_CODE = new Map<number, ApiErrorCode>(
  (Object.entries(API_ERROR_STATUS) as [ApiErrorCode, number][])
    // 409 has two codes; the caller says which one a bare 409 means.
    .filter(([, status]) => status !== 409)
    .map(([code, status]) => [status, code]),
)

/** The part of a zod schema the client uses, so zod need not be imported. */
interface Schema<T> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: readonly Issue[] } }
}
interface Issue {
  path: readonly PropertyKey[]
  message: string
}

function firstIssue(error: { issues: readonly Issue[] }): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid request'
  const where = issue.path.length ? `${issue.path.map(String).join('.')}: ` : ''
  return `${where}${issue.message}`
}

function validate<T>(schema: Schema<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new OpenSlotsError('invalid_request', firstIssue(parsed.error))
  }
  return parsed.data
}

/**
 * The instance's base URL without a trailing slash. `host` is an absolute
 * `http:` or `https:` URL, optionally with a path prefix
 * (`https://example.com/slots`), or a same-origin path (`''`, `/slots`).
 * A query string, fragment, credentials or another protocol would produce
 * wrong endpoint URLs, so they are refused.
 */
export function normalizeHost(host: string): string {
  const raw = host.trim()
  const fail = (why: string): never => {
    throw new TypeError(
      `OpenSlots: \`host\` ${why}. Use the instance's URL, for example https://slots.example.com (got ${JSON.stringify(host)}).`,
    )
  }
  if (raw.includes('?')) fail('must not include a query string')
  if (raw.includes('#')) fail('must not include a fragment')
  // A same-origin path: nothing to parse.
  if (raw === '' || (raw.startsWith('/') && !raw.startsWith('//'))) {
    return raw.replace(/\/+$/, '')
  }
  if (!/^https?:\/\//i.test(raw)) fail('must be an http or https URL')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return fail('is not a valid URL')
  }
  if (url.username || url.password) fail('must not include credentials')
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/**
 * Creates a client. It holds no state and makes no request until called.
 * Throws a `TypeError` straight away for an unusable `host`.
 */
export function createClient(options: ClientOptions): OpenSlotsClient {
  const host = normalizeHost(options.host)
  const base = `${host}/api/v1`

  async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    schema: Schema<T>,
    body: unknown,
    { signal }: RequestOptions = {},
    conflict: ApiErrorCode = 'slot_taken',
  ): Promise<T> {
    const doFetch = options.fetch ?? globalThis.fetch
    const headers: Record<string, string> = {
      Accept: 'application/json',
      [PUBLISHABLE_KEY_HEADER]: options.publishableKey,
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    let response: Response
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        // The customer's cookies are never needed or sent (TRD section 9).
        credentials: 'omit',
        mode: 'cors',
      })
    } catch (cause) {
      if (isAbortError(cause)) throw cause
      throw new OpenSlotsError('network_error', `Could not reach ${host}`, {
        cause,
      })
    }

    let json: unknown = undefined
    try {
      const text = await response.text()
      json = text ? JSON.parse(text) : undefined
    } catch (cause) {
      if (isAbortError(cause)) throw cause
      json = undefined
    }

    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(json)
      if (parsed.success) {
        throw new OpenSlotsError(
          parsed.data.error.code,
          parsed.data.error.message,
          { status: response.status },
        )
      }
      const code =
        response.status === 409
          ? conflict
          : (STATUS_TO_CODE.get(response.status) ??
            (response.status >= 500 ? 'internal_error' : 'invalid_response'))
      throw new OpenSlotsError(code, `HTTP ${response.status}`, {
        status: response.status,
      })
    }

    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      throw new OpenSlotsError(
        'invalid_response',
        `Unexpected response from ${path}: ${firstIssue(parsed.error)}`,
        { status: response.status, cause: parsed.error },
      )
    }
    return parsed.data
  }

  function tokenPath(token: string): string {
    validate(manageTokenSchema, token)
    return `/manage/${encodeURIComponent(token)}`
  }

  return {
    host,
    getBusiness: (opts) =>
      request('GET', '/business', businessResponseSchema, undefined, opts),
    getSlots: async (query, opts) => {
      const q = validate(slotsQuerySchema, query)
      const params = new URLSearchParams({
        service: q.service,
        from: q.from,
        to: q.to,
      })
      if (q.tz) params.set('tz', q.tz)
      return request(
        'GET',
        `/slots?${params}`,
        slotsResponseSchema,
        undefined,
        opts,
      )
    },
    createBooking: async (body, opts) =>
      request(
        'POST',
        '/bookings',
        createBookingResponseSchema,
        validate(createBookingBodySchema, body),
        opts,
      ),
    getBooking: async (token, opts) =>
      request('GET', tokenPath(token), manageSummarySchema, undefined, opts),
    cancelBooking: async (token, opts) =>
      request(
        'POST',
        `${tokenPath(token)}/cancel`,
        manageSummarySchema,
        {},
        opts,
        'booking_not_changeable',
      ),
    rescheduleBooking: async (token, body, opts) =>
      request(
        'POST',
        `${tokenPath(token)}/reschedule`,
        manageSummarySchema,
        validate(rescheduleBodySchema, body),
        opts,
      ),
  }
}
