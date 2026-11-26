'use client'

import {
  createToaster,
  Toast,
  ToastDescription,
  ToastRegion,
  ToastTitle,
} from '@ui-sdk/react/toast'
import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from 'lucide-react'

const toast = createToaster({ duration: 4000 })
const icons = {
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  error: OctagonX,
  loading: LoaderCircle,
  default: undefined,
}

function Toaster() {
  return (
    <ToastRegion
      toaster={toast}
      aria-label="Notifications"
      shortcut="alt+t"
      data-agent-hidden=""
      className="openslots-toaster fixed inset-auto end-4 bottom-4 z-50 m-0 w-[min(356px,calc(100%-2rem))] overflow-visible border-0 bg-transparent p-0 sm:end-6 sm:bottom-6"
    >
      {(notification) => {
        const Icon = icons[notification.type ?? 'default']
        return (
          <Toast className="absolute inset-x-0 bottom-0 flex items-center gap-2 overflow-hidden rounded-lg border bg-popover p-4 text-sm font-medium text-popover-foreground shadow-lg select-none">
            {Icon && (
              <Icon
                aria-hidden="true"
                className={
                  notification.type === 'loading'
                    ? 'size-4 shrink-0 animate-spin'
                    : 'size-4 shrink-0'
                }
              />
            )}
            <div>
              <ToastTitle />
              <ToastDescription className="text-muted-foreground" />
            </div>
          </Toast>
        )
      }}
    </ToastRegion>
  )
}

export { toast, Toaster }
