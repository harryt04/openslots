import { cn } from '@/lib/utils'

/**
 * The frame around a public page (design spec S8): a soft gradient behind a
 * centred column of at most 880px, and the credit line below it.
 */
export function HostedFrame({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <main
      className={cn(
        'min-h-screen bg-[radial-gradient(700px_300px_at_50%_0,var(--primary-soft),transparent_70%)] px-4 py-7 sm:px-5',
        className,
      )}
    >
      <div className="mx-auto max-w-[880px]">
        {children}
        <p className="mt-3.5 text-center text-xs text-muted-foreground">
          Powered by OpenSlots · free and open source
        </p>
      </div>
    </main>
  )
}
