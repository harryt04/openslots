'use client'

import type { ComponentProps } from 'react'
import * as Primitive from '@ui-sdk/react/calendar'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type CalendarProps = Omit<
  ComponentProps<typeof Primitive.Calendar>,
  'children' | 'className' | 'months'
> & { className?: string }

const stepClassName = cn(
  buttonVariants({ variant: 'ghost', size: 'icon' }),
  'size-8',
)

function Calendar({
  className,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <Primitive.Calendar
      className={cn('w-fit p-3', className)}
      showOutsideDays={showOutsideDays}
      {...props}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <Primitive.CalendarPrevious
          aria-label="Go to the Previous Month"
          className={stepClassName}
        >
          <ChevronLeftIcon aria-hidden="true" className="rtl:rotate-180" />
        </Primitive.CalendarPrevious>
        <Primitive.CalendarHeading className="text-sm font-medium" />
        <Primitive.CalendarNext
          aria-label="Go to the Next Month"
          className={stepClassName}
        >
          <ChevronRightIcon aria-hidden="true" className="rtl:rotate-180" />
        </Primitive.CalendarNext>
      </div>
      <Primitive.CalendarGrid className="border-separate border-spacing-y-1">
        <Primitive.CalendarWeekdays>
          {(index) => (
            <Primitive.CalendarWeekday
              index={index}
              className="pb-1 text-[0.8rem] font-normal text-muted-foreground"
            />
          )}
        </Primitive.CalendarWeekdays>
        <Primitive.CalendarWeeks>
          {(cell) => <CalendarDayButton value={cell.date} />}
        </Primitive.CalendarWeeks>
      </Primitive.CalendarGrid>
    </Primitive.Calendar>
  )
}

function CalendarDayButton({
  className,
  ...props
}: Omit<ComponentProps<typeof Primitive.CalendarDay>, 'className'> & {
  className?: string
}) {
  return (
    <Primitive.CalendarDay
      className={cn(
        'h-8 w-8 cursor-default rounded-md p-0 text-center text-sm tabular-nums outline-none select-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
        'data-disabled:opacity-50 data-outside:text-muted-foreground data-today:font-semibold data-today:underline data-unavailable:line-through data-unavailable:opacity-50',
        'data-preview:outline data-preview:outline-ring data-range-end:rounded-l-none data-range-middle:rounded-none data-range-middle:bg-accent data-range-middle:text-accent-foreground data-range-start:rounded-r-none data-selected:bg-primary data-selected:font-semibold data-selected:text-primary-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
