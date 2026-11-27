"use client"

import * as React from "react"
import { Slot } from "@/components/ui/slot"
import { cn } from "@/lib/utils"
import {
  Popover as PrimitiveRoot,
  PopoverTrigger as PrimitiveTrigger,
  PopoverContent as PrimitiveContent,
  PopoverTitle as PrimitiveTitle,
  PopoverDescription as PrimitiveDescription,
} from "@ui-sdk/react/popover"

const PopoverAnchorContext = React.createContext<
  ((element: HTMLElement | null) => void) | null
>(null)
const PopoverAnchorValueContext = React.createContext<HTMLElement | null>(null)

function Popover(props: React.ComponentProps<typeof PrimitiveRoot>) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)
  return (
    <PopoverAnchorContext.Provider value={setAnchor}>
      <PopoverAnchorValueContext.Provider value={anchor}>
        <PrimitiveRoot {...props} />
      </PopoverAnchorValueContext.Provider>
    </PopoverAnchorContext.Provider>
  )
}

function PopoverTrigger({
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

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  anchor,
  ...props
}: React.ComponentProps<typeof PrimitiveContent>) {
  const customAnchor = React.useContext(PopoverAnchorValueContext)
  return (
      <PrimitiveContent
        anchor={anchor === undefined ? customAnchor : anchor}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 origin-(--transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
          className
        )}
        {...props}
      />
  )
}

function PopoverAnchor({
  asChild,
  ref,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const setAnchor = React.useContext(PopoverAnchorContext)
  const anchorRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      setAnchor?.(element)
      if (typeof ref === "function") {
        const cleanup = ref(element)
        return () => {
          setAnchor?.(null)
          if (cleanup) cleanup()
          else ref(null)
        }
      }
      if (ref) ref.current = element
    },
    [ref, setAnchor]
  )
  const Comp = asChild ? Slot : "div"
  return <Comp data-slot="popover-anchor" ref={anchorRef} {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <PrimitiveTitle
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <PrimitiveDescription
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
}
