import type { Metadata } from 'next'

import { Gallery } from './gallery'

export const metadata: Metadata = { title: 'Component gallery' }

/**
 * Every `@openslots/react` export against an in-memory mock of the public
 * API (development only; the /dev layout 404s in production). For checking
 * C1, S8, S9, C-1 to C-4 and T-1 to T-6 against the design spec.
 */
export default function GalleryPage() {
  return <Gallery />
}
