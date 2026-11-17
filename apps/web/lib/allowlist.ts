export function parseAllowedEmails(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}
export function isEmailAllowed(
  email: string,
  value = process.env.OPENSLOTS_ALLOWED_EMAILS,
): boolean {
  return (
    !value?.trim() ||
    parseAllowedEmails(value).includes(email.trim().toLowerCase())
  )
}
