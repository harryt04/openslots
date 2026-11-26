"use client"

import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Radio, RadioGroup } from "@ui-sdk/react/radio"
import { Toggle, ToggleGroup as PressedGroup } from "@ui-sdk/react/toggle"

import { toggleVariants } from "@/components/ui/toggle"

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    type?: "single" | "multiple"
  }
>({
  size: "default",
  variant: "default",
  spacing: 0,
})

type SelectionProps =
  | {
      type: "single"
      value?: string
      defaultValue?: string
      onValueChange?: (value: string) => void
    }
  | {
      type: "multiple"
      value?: string[]
      defaultValue?: string[]
      onValueChange?: (value: string[]) => void
    }

type ToggleGroupProps = SelectionProps &
  VariantProps<typeof toggleVariants> &
  Omit<React.ComponentProps<"div">, "defaultValue"> & {
    spacing?: number
    disabled?: boolean
    loop?: boolean
    orientation?: "horizontal" | "vertical"
  }

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  children,
  style,
  orientation,
  ...props
}: ToggleGroupProps) {
  const { type, value, defaultValue, onValueChange, ...rest } = props
  const groupProps = {
    ...rest,
    "data-variant": variant,
    "data-size": size,
    "data-spacing": spacing,
    style: { ...style, "--gap": spacing } as React.CSSProperties,
    className: cn(
      "group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-xs",
      className,
    ),
  }

  return (
    <ToggleGroupContext.Provider value={{ variant, size, spacing, type }}>
      {type === "single" ? (
        <RadioGroup
          {...groupProps}
          aria-orientation={orientation}
          value={value === "" ? null : value}
          defaultValue={defaultValue || undefined}
          onValueChange={(next) => onValueChange?.(next ?? "")}
        >
          {children}
        </RadioGroup>
      ) : (
        <PressedGroup
          {...groupProps}
          multiple
          orientation={orientation}
          value={value}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
        >
          {children}
        </PressedGroup>
      )}
    </ToggleGroupContext.Provider>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: Omit<React.ComponentProps<"button">, "value" | "type" | "onSelect"> &
  VariantProps<typeof toggleVariants> & { value: string }) {
  const context = React.useContext(ToggleGroupContext)

  const Item = context.type === "single" ? Radio : Toggle

  return (
    <Item
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        "data-checked:bg-accent data-checked:text-accent-foreground",
        "w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10",
        "data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l",
        className,
      )}
      {...props}
    >
      {children}
    </Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
