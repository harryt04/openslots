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

import { Button } from "@/components/ui/button"

function Dialog({
  ...props
}: React.ComponentProps<typeof PrimitiveRoot>) {
  return <PrimitiveRoot {...props} />
}

function DialogTrigger({
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

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DialogClose({
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

function DialogOverlay({
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

function DialogContent({
  className,
  children,
  showCloseButton = true,
  container = typeof document === "undefined" ? undefined : document.body,
  ...props
}: Omit<React.ComponentProps<typeof PrimitiveContent>, "children"> & {
  children?: React.ReactNode
  showCloseButton?: boolean
}) {
  return (
    <>
      <DialogOverlay />
      <PrimitiveContent
        container={container}
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 sm:max-w-lg",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <PrimitiveClose
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-open:bg-accent data-open:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </PrimitiveClose>
        )}
      </PrimitiveContent>
    </>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <PrimitiveClose render={<Button type="button" variant="outline" />}>
          Close
        </PrimitiveClose>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof PrimitiveTitle>) {
  return (
    <PrimitiveTitle
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
