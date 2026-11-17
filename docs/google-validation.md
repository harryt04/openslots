# Google integration validation

No real Google credentials were available for slice 1B. Documentation, typed compilation, mocked REST tests, fake-mode browser checks and Playwright are the automated evidence; they do not prove live consent or refresh.

With a real Google Cloud OAuth web client:

1. Enable Google Calendar API. Configure the consent screen and add the three scopes in TRD section 6. While testing, add each test Google account as a test user. Testing refresh tokens expire after seven days; move the OAuth app to production for lasting access (Google may require verification).
2. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BETTER_AUTH_SECRET, BETTER_AUTH_URL and MONGO_CONNECTION_STRING in apps/web/.env.local. Register BETTER_AUTH_URL/api/auth/callback/google as an authorized redirect URI. Start pnpm run dev.
3. Set OPENSLOTS_ALLOWED_EMAILS to your email. Sign in at /login; verify one consent requests calendar permissions and creates a session. Sign out and try a different account: verify refusal and the login error message. Unset the allowlist only if open registration is intended.
4. Inspect the account collection privately: access/refresh tokens must be encrypted. Never paste values into logs, screenshots or issues. From a server-only script, use calendarProvider with the account record id and owner user id. List calendars, query freeBusy, create an event with a test attendee, update it and delete it; verify invitation/update emails and a shared writable calendar.
5. Expire accessTokenExpiresAt in the test account document, call the provider again and verify Better Auth refreshes and persists the token. Revoke app access in Google account settings and expire the access token again; verify CalendarAuthError. Never expose this script as a public route.
6. In the later 2C signed-in calendar settings UI, use linkSocial for a second allowlisted Google email. Verify both account records remain linked to the same owner and each provider uses its explicitly selected account. This UI is outside 1B.
7. Check /api/auth/get-access-token, /refresh-token and /account-info return 404, even with a session. Verify the browser receives no OAuth tokens.

References: [Better Auth Google](https://www.better-auth.com/docs/authentication/google), [OAuth](https://www.better-auth.com/docs/concepts/oauth), [Google OAuth expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

## Adapter contracts and remaining live checks

- Use `eventIdForBooking(bookingId)` from the server-only calendar module as the
  optional event `id`. SHA-256 lowercase hex uses Google's base32hex alphabet;
  reuse the same booking id across retries. Duplicate creates return that id.
  Updates use PATCH with absolute values; repeated deletes accept 404 and 410.
- Better Auth 1.7.25 returns `FAILED_TO_GET_ACCESS_TOKEN` for every refresh failure,
  including transient endpoint failures. We retry once before requesting reconnect;
  this ambiguity cannot be eliminated without owning the refresh implementation.
- Verify with a real account how Google keys `primary` in free/busy responses.
  Verify the 50-calendar free/busy expansion limit and supported time-range limits;
  callers must split larger queries. These checks have not been run live.
- Admission uses 1.7.25's redirect-aware `user.validateUserInfo` for fresh Google
  identity on sign-in and linking, plus database user/session creation guards.
  An account-create hook cannot validate a different linked email: the account
  data has no email, and the owner's email is not the linked identity.
- Untick a calendar permission on the Google consent screen at first sign-in, confirm the calendar is reported as needing a reconnect, then reconnect from the Calendars page (which uses `linkSocial`) with every permission ticked and confirm it recovers. A plain sign-out and sign-in does not update the stored scopes.
- Choose a calendar shared with you read-only as the booking calendar and confirm a booking attempt reports a calendar error without marking the account as needing a reconnect.
- After upgrading `better-auth`, re-run `apps/web/lib/auth-callback.test.ts`: the allowlist relies on its `user.validateUserInfo` option.

## Slice 2C manual validation (not run live)

1. Connect the sign-in account at `/calendars`. Confirm its primary calendar receives bookings, writable calendars initially block, and read-only calendars initially do not.
2. Link another Google account with a different allowlisted email. Select that identity in Google's account chooser; confirm both remain linked to the owner. Connect the same account to another owned business and verify choices are independent.
3. Share a read-only calendar with the owner. Refresh: it must offer a blocking switch but no booking destination button. Calendar listing must never request event details.
4. Revoke OpenSlots access from Google account settings, expire the access token, and Refresh. Confirm Needs reconnect, its timestamp, sidebar warning and Bookings banner. Reconnect using the same Google identity and accept all scopes; confirm Refresh succeeds and warnings disappear. Plain sign-in is not a substitute.
5. Change the booking destination, then unlink the former account. Verify only this business's link disappears; the Better Auth identity remains.


### Review fixes (no live Google validation)

- Linking snapshots the owner's accounts in a ten-minute, single-use server record. The return handler connects exactly one new identity, or refreshes only the named reconnect identity. Visit `/calendars?linked=1` and verify it changes nothing. Replay a return URL, switch businesses before returning, and try it as another owner: none may connect accounts.
- Unlink an account, link/reconnect another, and confirm the unlinked account remains available only through its explicit Connect button. Repeat in a second business.
- Remove the selected calendar or change it to read-only, then Refresh. Confirm the destination moves and the save message explains it. With no healthy writable calendar, confirm No booking calendar on Calendars and Bookings and no availability. Unlink the last account and confirm the same state.
- Real account records have no email field. Read the verified email claim from the Google id token stored by Better Auth's validated OAuth exchange. For older accounts without that token, use the primary calendar's name (or Google account), never the owner's email. Fake accounts have explicit fixture emails. Validate the real secondary identity label manually; this has not been tested live.
- Better Auth 1.7.25 `dist/api/routes/callback.mjs` invokes `linkOAuthAccount`; `dist/oauth2/link-account.mjs` calls `assertValidUserInfo` with the fresh linked identity and action `link-account` before account creation/update. The handler test now exercises refusal of a second identity outside the allowlist.

## Slice 3A tombstones and restore (manual, not verified locally)

1. On a disposable calendar, insert a deterministic event id, then delete it.
2. Read it with showDeleted and confirm Google retains status cancelled.
3. Insert the same id and record whether Google returns 409 duplicate.
4. PATCH that id with status confirmed and new start/end; confirm it restores,
   retains the id, moves to the new time and sends the expected attendee update.
5. Record 404/410 versus successful PATCH behaviour for a permanently removed
   event. Verify create followed by confirmed PATCH converges, or that the
   booking retains eventSync and retries with backoff when restoration fails.
6. Cancel while a missing-event reconcile is paused; confirm no later recreation
   occurs after cancellation is observed or the provider deadline passes.

Do not paste calendar ids, attendee details or OAuth credentials into the PR.
