import { z } from 'zod'

import { slugProblem } from './slug'

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const businessInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name.')
    .max(80, 'Use at most 80 characters.'),
  slug: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const problem = slugProblem(value)
      if (problem) ctx.addIssue({ code: 'custom', message: problem })
    }),
  timezone: z
    .string()
    .refine(
      isValidTimezone,
      'Choose a valid time zone, such as Europe/London.',
    ),
})

export type BusinessInput = z.infer<typeof businessInputSchema>

/** Result of a form action: field errors are shown inline. */
export type ActionResult =
  | { ok: true; redirectTo?: string }
  | {
      ok: false
      fieldErrors?: Partial<Record<keyof BusinessInput, string>>
      message?: string
    }
