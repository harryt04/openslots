"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import * as Primitive from "@ui-sdk/react/select"

const Select = Primitive.Select<string>
const SelectGroup = Primitive.SelectGroup
const SelectValue = Primitive.SelectValue

const ScrollListContext = React.createContext<HTMLDivElement | null>(null)

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: Omit<React.ComponentProps<typeof Primitive.SelectTrigger>, "children"> & {
  children?: React.ReactNode
} & {
  size?: "sm" | "default"
}) {
  return (
    <Primitive.SelectTrigger
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon aria-hidden="true" className="size-4 opacity-50" />
    </Primitive.SelectTrigger>
  )
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  sideOffset = position === "popper" ? 4 : 0,
  container = typeof document === "undefined" ? undefined : document.body,
  ...props
}: Omit<
  React.ComponentProps<typeof Primitive.SelectContent>,
  "className" | "children"
> & {
  className?: string
  children?: React.ReactNode
  position?: "item-aligned" | "popper"
}) {
  const [list, setList] = React.useState<HTMLDivElement | null>(null)

  // UI SDK focuses the selected item on open without scrolling to it when the
  // list cannot sit over the trigger (long lists such as time zones), so bring
  // it into view once the list has its size. Layout offsets, not client
  // rects, because the opening animation scales the popup.
  React.useEffect(() => {
    if (!list) return
    const frame = requestAnimationFrame(() => {
      const item = list.querySelector<HTMLElement>("[data-selected]")
      if (!item) return
      const top =
        item.offsetParent === list
          ? item.offsetTop
          : item.offsetParent === list.offsetParent
            ? item.offsetTop - list.offsetTop - list.clientTop
            : null
      if (top === null) {
        item.scrollIntoView({ block: "nearest" })
        return
      }
      const bottom = top + item.offsetHeight
      if (top >= list.scrollTop && bottom <= list.scrollTop + list.clientHeight)
        return
      list.scrollTop = top - (list.clientHeight - item.offsetHeight) / 2
    })
    return () => cancelAnimationFrame(frame)
  }, [list])

  return (
    <Primitive.SelectContent
      className={cn(
        "relative z-50 flex max-h-(--available-height) min-h-0 min-w-[8rem] origin-(--transform-origin) flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        "min-w-(--anchor-width)",
        className,
      )}
      alignItemWithTrigger={position === "item-aligned"}
      align={align}
      sideOffset={sideOffset}
      container={container}
      {...props}
    >
      <ScrollListContext.Provider value={list}>
        <SelectScrollUpButton />
        <Primitive.SelectList
          ref={setList}
          className="min-h-0 overflow-x-hidden overflow-y-auto p-1"
        >
          {children}
        </Primitive.SelectList>
        <SelectScrollDownButton />
      </ScrollListContext.Provider>
    </Primitive.SelectContent>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.SelectGroupLabel>) {
  return (
    <Primitive.SelectGroupLabel
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Primitive.SelectItem>, "children"> & {
  children?: React.ReactNode
}) {
  return (
    <Primitive.SelectItem
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <Primitive.SelectItemIndicator>
          <CheckIcon className="size-4" />
        </Primitive.SelectItemIndicator>
      </span>
      <Primitive.SelectItemText>{children}</Primitive.SelectItemText>
    </Primitive.SelectItem>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.SelectSeparator>) {
  return (
    <Primitive.SelectSeparator
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollButton({
  direction,
  className,
  ...props
}: React.ComponentProps<"button"> & { direction: -1 | 1 }) {
  const list = React.useContext(ScrollListContext)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (!list) return
    function update() {
      if (!list) return
      setVisible(
        direction === -1
          ? list.scrollTop > 1
          : list.scrollTop + list.clientHeight < list.scrollHeight - 1,
      )
    }
    const observer = new ResizeObserver(update)
    observer.observe(list)
    list.addEventListener("scroll", update, { passive: true })
    update()
    return () => {
      observer.disconnect()
      list.removeEventListener("scroll", update)
    }
  }, [direction, list])

  if (!visible) return null

  const Icon = direction === -1 ? ChevronUpIcon : ChevronDownIcon
  return (
    <button
      {...props}
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      data-select-scroll={direction === -1 ? "up" : "down"}
      className={cn(
        "flex shrink-0 cursor-default items-center justify-center bg-popover py-1",
        className,
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => list?.scrollBy({ top: direction * 80 })}
    >
      <Icon className="size-4" />
    </button>
  )
}

function SelectScrollUpButton(props: React.ComponentProps<"button">) {
  return <SelectScrollButton {...props} direction={-1} />
}

function SelectScrollDownButton(props: React.ComponentProps<"button">) {
  return <SelectScrollButton {...props} direction={1} />
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
