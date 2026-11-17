import type { ServiceColor } from '@openslots/core'

/**
 * Static Tailwind classes for each service color token, so the class names
 * survive Tailwind's source scan. Text on a service color uses
 * `text-svc-foreground`.
 */
export const SERVICE_COLOR_CLASS: Record<ServiceColor, string> = {
  blue: 'bg-svc-blue',
  orange: 'bg-svc-orange',
  sky: 'bg-svc-sky',
  vermillion: 'bg-svc-vermillion',
  pink: 'bg-svc-pink',
  yellow: 'bg-svc-yellow',
}

/** Names read out by screen readers and shown beside the color picker. */
export const SERVICE_COLOR_LABEL: Record<ServiceColor, string> = {
  blue: 'Blue',
  orange: 'Orange',
  sky: 'Sky',
  vermillion: 'Vermillion',
  pink: 'Pink',
  yellow: 'Yellow',
}

/**
 * The same, repeated under `dark:` for components whose own classes set a
 * dark-mode background (the shadcn radio item does).
 */
export const SERVICE_SWATCH_CLASS: Record<ServiceColor, string> = {
  blue: 'bg-svc-blue dark:bg-svc-blue',
  orange: 'bg-svc-orange dark:bg-svc-orange',
  sky: 'bg-svc-sky dark:bg-svc-sky',
  vermillion: 'bg-svc-vermillion dark:bg-svc-vermillion',
  pink: 'bg-svc-pink dark:bg-svc-pink',
  yellow: 'bg-svc-yellow dark:bg-svc-yellow',
}
