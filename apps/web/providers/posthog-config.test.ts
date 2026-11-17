import { expect, test } from 'vitest'
import { analyticsConfig } from './posthog-config'

test('analytics captures no elements or recordings and removes URL credentials in search/hash', () => {
  expect(analyticsConfig).toMatchObject({
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
  })
  const event = {
    event: '$pageview',
    properties: {
      $current_url: 'https://example.test/?customer=private#token',
      $referrer: 'https://example.test/search?q=private',
      $initial_current_url: 'https://example.test/?token=private',
    },
  }
  type Event = typeof event
  const filter = analyticsConfig.before_send as unknown as (
    event: Event,
  ) => Event
  expect(filter(event).properties).toEqual({
    $current_url: 'https://example.test/',
    $referrer: 'https://example.test/search',
    $initial_current_url: 'https://example.test/',
  })
})
