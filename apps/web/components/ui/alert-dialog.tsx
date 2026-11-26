"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  AlertDialog as PrimitiveRoot,
  AlertDialogBackdrop as PrimitiveBackdrop,
  AlertDialogClose as PrimitiveClose,
  AlertDialogContent as PrimitiveContent,
  AlertDialogDescription as PrimitiveDescription,
  AlertDialogTitle as PrimitiveTitle,
  AlertDialogTrigger as PrimitiveTrigger,
} from "@ui-sdk/react/alert-dialog"

import { buttonVariants, type Button } from "@/components/ui/button"

function AlertDialog({
  ...props
}: React.ComponentProps<typeof PrimitiveRoot>) {
  return <PrimitiveRoot {...props} />
}

function AlertDialogTrigger({
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

function AlertDialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function AlertDialogOverlay({
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

function AlertDialogContent({
  className,
  size = "default",
  container = typeof document === "undefined" ? undefined : document.body,
  ...props
}: React.ComponentProps<typeof PrimitiveContent> & {
  size?: "default" | "sm"
}) {
  return (
    <>
      <AlertDialogOverlay />
      <PrimitiveContent
        container={container}
        initialFocus="[data-alert-dialog-cancel]"
        data-size={size}
        className={cn(
          "group/alert-dialog-content fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[size=sm]:max-w-xs data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[size=default]:sm:max-w-lg",
          className
        )}
        {...props}
      />
    </>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof PrimitiveTitle>) {
  return (
    <PrimitiveTitle
      className={cn(
        "text-lg font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogDescription({
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

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-16 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof PrimitiveClose> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <PrimitiveClose
      type="button"
      data-agent-hidden=""
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof PrimitiveClose> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <PrimitiveClose
      data-alert-dialog-cancel=""
      type="button"
      data-agent-hidden=""
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
