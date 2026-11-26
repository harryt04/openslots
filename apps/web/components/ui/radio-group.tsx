'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { CircleIcon } from 'lucide-react'
import * as Primitive from '@ui-sdk/react/radio'

function RadioGroup({
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof Primitive.RadioGroup>,
  'className' | 'children'
> & { className?: string; children?: React.ReactNode }) {
  return (
    <Primitive.RadioGroup className={cn('grid gap-3', className)} {...props} />
  )
}

function RadioGroupItem({
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof Primitive.Radio>,
  'className' | 'children'
> & { className?: string; children?: React.ReactNode }) {
  return (
    <Primitive.Radio
      className={cn(
        'aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    >
      <Primitive.RadioIndicator
        data-openslots-radio-indicator=""
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" />
      </Primitive.RadioIndicator>
    </Primitive.Radio>
  )
}

export { RadioGroup, RadioGroupItem }
