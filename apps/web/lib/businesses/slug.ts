/**
 * Business URL slugs. The hosted booking pages live at `/<slug>`, so a slug
 * must never collide with an app route.
 */

/** Top-level paths the app uses or may use. Refused as slugs. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'availability',
  'bookings',
  'businesses',
  'calendars',
  'dashboard',
  'dev',
  'developers',
  'favicon',
  'login',
  'logout',
  'manage',
  'new',
  'onboarding',
  'public',
  'robots',
  'services',
  'settings',
  'sign-in',
  'sign-out',
  'signup',
  'sitemap',
  'static',
  'www',
])

export const SLUG_MIN = 3
export const SLUG_MAX = 40

/** Lower-case, accent-free, hyphen-separated suggestion from a name. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '')
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** An error message, or null when the slug is acceptable. */
export function slugProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN) return `Use at least ${SLUG_MIN} characters.`
  if (slug.length > SLUG_MAX) return `Use at most ${SLUG_MAX} characters.`
  if (!SLUG_PATTERN.test(slug)) {
    return 'Use lower-case letters, numbers and single hyphens, not at the start or end.'
  }
  if (RESERVED_SLUGS.has(slug)) return 'That address is reserved. Try another.'
  return null
}
