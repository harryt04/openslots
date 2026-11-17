import React from 'react'
import { createRoot } from 'react-dom/client'
import { BookingFlow } from '@openslots/react'
const query = new URLSearchParams(location.search)
createRoot(document.getElementById('root')!).render(
  <BookingFlow host={query.get('host')!} publishableKey={query.get('key')!} />,
)
