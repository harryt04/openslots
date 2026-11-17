import type { BusinessResponse, SlotsResponse } from '@openslots/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  createClient,
  type ClientOptions,
  type OpenSlotsClient,
} from './client'
import { isAbortError } from './errors'

/**
 * How a component or hook reaches the API: either the instance and key
 * (a client is made for you), or a client you made with `createClient`.
 */
export type Connection =
  | (ClientOptions & { client?: never })
  | {
      client: OpenSlotsClient
      host?: never
      publishableKey?: never
      fetch?: never
    }

/** The client for a connection, stable while its inputs are. */
export function useClient(connection: Connection): OpenSlotsClient {
  const { client, host, publishableKey, fetch } = connection
  return useMemo(
    () =>
      client ??
      createClient({
        host: host as string,
        publishableKey: publishableKey as string,
        fetch,
      }),
    [client, host, publishableKey, fetch],
  )
}

export interface RequestState<T> {
  data: T | undefined
  error: unknown
  /** True while a request for the current inputs is in flight. */
  loading: boolean
  /** Asks again with the same inputs. Data stays visible meanwhile. */
  refetch: () => void
}

interface Stored<T> {
  key: string | null
  data?: T
  error?: unknown
  loading: boolean
}

/**
 * Runs `run` whenever `key` changes (null means "nothing to fetch"). A
 * response for an older key, or one that arrives after unmount, is dropped:
 * its request is aborted and its result ignored.
 */
export function useRequest<T>(
  key: string | null,
  run: (signal: AbortSignal) => Promise<T>,
): RequestState<T> {
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  })

  const [nonce, setNonce] = useState(0)
  const [stored, setStored] = useState<Stored<T>>({ key: null, loading: false })

  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    setStored((s) =>
      s.key === key
        ? { ...s, loading: true }
        : { key, loading: true, data: undefined, error: undefined },
    )
    runRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setStored({ key, data, loading: false })
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return
        setStored((s) => ({
          key,
          data: s.key === key ? s.data : undefined,
          error,
          loading: false,
        }))
      },
    )
    return () => controller.abort()
  }, [key, nonce])

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  // Until the effect has run for a new key, report loading with no data
  // rather than the previous key's result.
  if (stored.key !== key) {
    return { data: undefined, error: undefined, loading: key !== null, refetch }
  }
  return {
    data: stored.data,
    error: stored.error,
    loading: stored.loading,
    refetch,
  }
}

/** The business, its timezone and its active services. */
export function useBusiness(
  connection: Connection,
): RequestState<BusinessResponse> {
  const client = useClient(connection)
  // A new host, key or client refetches; a new inline `fetch` alone does not.
  const key = `${connectionKey(connection)}|business`
  return useRequest(key, (signal) => client.getBusiness({ signal }))
}

export type UseSlotsOptions = Connection & {
  /** Service id. Nothing is fetched until it is set. */
  service: string | null | undefined
  /** First date, `YYYY-MM-DD` in `timezone`. */
  from: string | null | undefined
  /** Last date, inclusive; at most 62 days after `from`. */
  to: string | null | undefined
  /** The customer's IANA timezone; dates and grouping use it. */
  timezone?: string | null
}

/** Open slots for one service between two dates. */
export function useSlots(
  options: UseSlotsOptions,
): RequestState<SlotsResponse> {
  const client = useClient(options)
  const { service, from, to, timezone } = options
  const ready = Boolean(service && from && to)
  const key = ready
    ? `${connectionKey(options)}|slots|${service}|${from}|${to}|${timezone ?? ''}`
    : null
  return useRequest(key, (signal) =>
    client.getSlots(
      {
        service: service as string,
        from: from as string,
        to: to as string,
        ...(timezone ? { tz: timezone } : {}),
      },
      { signal },
    ),
  )
}

const clientIds = new WeakMap<OpenSlotsClient, number>()
let nextClientId = 1

/** Identifies what a connection talks to, for request keys. */
function connectionKey(connection: Connection): string {
  if (connection.client) {
    let id = clientIds.get(connection.client)
    if (id === undefined) {
      id = nextClientId++
      clientIds.set(connection.client, id)
    }
    return `client:${id}`
  }
  return `${connection.host}|${connection.publishableKey}`
}
