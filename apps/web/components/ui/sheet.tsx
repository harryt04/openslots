"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"
import {
  Dialog as PrimitiveRoot,
  DialogBackdrop as PrimitiveBackdrop,
  DialogClose as PrimitiveClose,
  DialogContent as PrimitiveContent,
  DialogDescription as PrimitiveDescription,
  DialogTitle as PrimitiveTitle,
  DialogTrigger as PrimitiveTrigger,
} from "@ui-sdk/react/dialog"

function Sheet({ ...props }: React.ComponentProps<typeof PrimitiveRoot>) {
  return <PrimitiveRoot {...props} />
}

function SheetTrigger({
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

function SheetClose({
  asChild,
  children,
  render,
  ...props
}: React.ComponentProps<typeof PrimitiveClose> & { asChild?: boolean }) {
  return (
    <PrimitiveClose
      {...props}
      render={asChild ? (children as React.ReactElement) : render}
    >
      {asChild ? undefined : children}
    </PrimitiveClose>
  )
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof PrimitiveBackdrop>) {
  return (
    <PrimitiveBackdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-ending-style:animate-out data-ending-style:fade-out-0 data-open:animate-in data-open:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: Omit<React.ComponentProps<typeof PrimitiveContent>, "children"> & {
  children?: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <>
      <SheetOverlay />
      <PrimitiveContent
        className={cn(
          "fixed m-0 z-50 flex flex-col gap-4 bg-background shadow-lg transition ease-in-out data-ending-style:animate-out data-ending-style:duration-300 data-open:animate-in data-open:duration-500",
          side === "right" &&
            "inset-y-0 right-0 left-auto h-full w-3/4 border-l data-ending-style:slide-out-to-right data-open:slide-in-from-right sm:max-w-sm",
          side === "left" &&
            "inset-y-0 left-0 right-auto h-full w-3/4 border-r data-ending-style:slide-out-to-left data-open:slide-in-from-left sm:max-w-sm",
          side === "top" &&
            "inset-x-0 top-0 bottom-auto h-auto w-full border-b data-ending-style:slide-out-to-top data-open:slide-in-from-top",
          side === "bottom" &&
            "inset-x-0 bottom-0 top-auto h-auto w-full border-t data-ending-style:slide-out-to-bottom data-open:slide-in-from-bottom",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <PrimitiveClose className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-open:bg-secondary">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </PrimitiveClose>
        )}
      </PrimitiveContent>
    </>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof PrimitiveTitle>) {
  return (
    <PrimitiveTitle
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof PrimitiveDescription>) {
  return (
    <PrimitiveDescription
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
