/** Only these server-authored messages may be selected by a return URL. */
export const calendarNotices = {
  saved: 'Saved',
  no_writable: 'No writable calendar. Share a writable calendar, then Refresh.',
  moved: 'Booking calendar moved to an available writable calendar.',
  reconnect: 'Connection needs reconnecting.',
  temporary: 'Temporary calendar problem. Please retry Refresh.',
  missing:
    'That Google account is no longer linked to your sign-in. Link it again.',
  existing:
    'That Google account was already yours. Use Connect beside it to add it to this business.',
  multiple:
    'Several Google accounts were added at once. Use Connect beside the one you want.',
  unreadable:
    'The account was added, but its calendars could not be read. Try Refresh.',
} as const

export function calendarNotice(code?: string): string | undefined {
  return code && Object.hasOwn(calendarNotices, code)
    ? calendarNotices[code as keyof typeof calendarNotices]
    : undefined
}

export function calendarNoticeCode(message: string): string | undefined {
  return Object.entries(calendarNotices).find(
    ([, text]) => text === message,
  )?.[0]
}
