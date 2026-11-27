"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  Tooltip as PrimitiveRoot,
  TooltipTrigger as PrimitiveTrigger,
  TooltipContent as PrimitiveContent,
  TooltipArrow as PrimitiveArrow,
} from "@ui-sdk/react/tooltip"

const TooltipDelayContext = React.createContext(0)

function TooltipProvider({
  delayDuration = 0,
  children,
}: {
  delayDuration?: number
  children?: React.ReactNode
}) {
  return (
    <TooltipDelayContext.Provider value={delayDuration}>
      {children}
    </TooltipDelayContext.Provider>
  )
}

function Tooltip({
  delayDuration,
  ...props
}: React.ComponentProps<typeof PrimitiveRoot> & { delayDuration?: number }) {
  const providerDelay = React.useContext(TooltipDelayContext)
  return <PrimitiveRoot delay={delayDuration ?? providerDelay} {...props} />
}

function TooltipTrigger({
  asChild,
  children,
  render,
  ...props
}: React.ComponentProps<typeof PrimitiveTrigger> & { asChild?: boolean }) {
  return (
    <PrimitiveTrigger
      {...props}
      render={asChild ? (children as React.ReactElement) : render}
    >
      {asChild ? undefined : children}
    </PrimitiveTrigger>
  )
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: Omit<React.ComponentProps<typeof PrimitiveContent>, "children"> & {
  children?: React.ReactNode
}) {
  return (
      <PrimitiveContent
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-fit origin-(--transform-origin) animate-in rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <PrimitiveArrow className="size-2 rotate-45 rounded-[2px] bg-foreground" />
      </PrimitiveContent>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
