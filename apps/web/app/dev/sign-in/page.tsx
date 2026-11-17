import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isFakeGoogle } from '@/lib/env'

import { TestSignIn } from './test-sign-in'

export const metadata: Metadata = { title: 'Test sign-in' }

export default function DevSignIn() {
  if (!isFakeGoogle()) {
    notFound()
  }
  return (
    <main className="grid min-h-screen place-content-center p-10">
      <TestSignIn />
    </main>
  )
}
