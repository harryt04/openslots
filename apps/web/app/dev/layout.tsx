import { notFound } from 'next/navigation'

// Development-only routes: the token sheet, the test sign-in and, later, the
// component gallery. They do not exist in a production build.
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }
  return <>{children}</>
}
