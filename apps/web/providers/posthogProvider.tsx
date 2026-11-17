'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'

const analyticsKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const runningInProduction =
  process.env.NODE_ENV === 'production' &&
  typeof window !== 'undefined' &&
  !!analyticsKey
if (runningInProduction && analyticsKey) {
  posthog.init(analyticsKey, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    // The signed-in pages show customers' names, emails and notes. Analytics
    // here is page views only: no click or text capture, no recordings, and
    // no query strings (a search box may hold a customer's name).
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    before_send: (event) => {
      if (!event) return event
      for (const key of ['$current_url', '$referrer', '$initial_current_url']) {
        const value = event.properties?.[key]
        if (typeof value === 'string') {
          event.properties[key] = value.split(/[?#]/)[0]
        }
      }
      return event
    },
  })
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathName = usePathname()

  useEffect(() => {
    if (!runningInProduction) {
      return
    }
    posthog.capture('$pageview', { pathName })
  }, [pathName])

  if (!runningInProduction) {
    return <>{children}</> // Don't send events in dev mode
  }

  return <PHProvider client={posthog}>{children}</PHProvider>
}
