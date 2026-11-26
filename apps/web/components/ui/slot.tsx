import { renderElement } from "@ui-sdk/react/primitive"
import type * as React from "react"

function Slot({
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }) {
  if (children == null) return null

  // UI SDK resolves lazy server-rendered children before composing their props.
  return renderElement("div", props, children as React.ReactElement)
}

export { Slot }
