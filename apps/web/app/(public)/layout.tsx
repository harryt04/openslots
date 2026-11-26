import '@openslots/react/styles.css'

// Public pages (/b and /m): no signed-in chrome, and no PostHog, which only
// the (dashboard) layout loads (TRD section 9). Light or dark follows the
// root ThemeProvider, which sets a `dark` class on <html> from the visitor's
// stored choice or system preference, before first paint. The booking package
// reads the same class (`theme="auto"`), so the page and the component can
// never disagree.
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div data-agent-hidden="" data-agent-secret="">
      {children}
    </div>
  )
}
