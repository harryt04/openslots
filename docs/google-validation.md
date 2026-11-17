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
