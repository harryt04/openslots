'use client'

import * as React from 'react'
import { Textarea as Primitive } from '@ui-sdk/react/textarea'
import { cn } from '@/lib/utils'

function Textarea({
  value,
  defaultValue,
  onSubmit,
  className,
  ...props
}: React.ComponentProps<'textarea'> & {
  onValueChange?: (value: string) => void
}) {
  return (
    <Primitive
      value={value === undefined ? undefined : String(value)}
      defaultValue={
        defaultValue === undefined ? undefined : String(defaultValue)
      }
      render={<textarea onSubmit={onSubmit} />}
      data-agent-confirm="Edit protected field"
      data-agent-secret=""
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
