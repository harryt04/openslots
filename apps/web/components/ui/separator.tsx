'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import * as Primitive from '@ui-sdk/react/separator'

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: Omit<
  React.ComponentProps<typeof Primitive.Separator>,
  'className' | 'children'
> & { className?: string; children?: React.ReactNode }) {
  return (
    <Primitive.Separator
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
