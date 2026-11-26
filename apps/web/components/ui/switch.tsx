'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import * as Primitive from '@ui-sdk/react/switch'

function Switch({
  className,
  size = 'default',
  ...props
}: Omit<
  React.ComponentProps<typeof Primitive.Switch>,
  'className' | 'children'
> & { className?: string; children?: React.ReactNode } & {
  size?: 'sm' | 'default'
}) {
  return (
    <Primitive.Switch
      data-agent-confirm="Change switch"
      data-size={size}
      className={cn(
        'peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary data-unchecked:bg-input data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 dark:data-unchecked:bg-input/80',
        className,
      )}
      {...props}
    >
      <Primitive.SwitchThumb
        className={cn(
          'pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground',
        )}
      />
    </Primitive.Switch>
  )
}

export { Switch }
