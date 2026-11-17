import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { APIError } from 'better-auth/api'
import { isEmailAllowed } from './allowlist'
import { nextCookies } from 'better-auth/next-js'
import { MongoClient } from 'mongodb'

import { isFakeGoogle, requireEnv } from './env'
import { mongoDBConfig } from './mongo-client'

// Better Auth keeps its own client: a separate connection lifecycle from the
// application's queries.
const client = new MongoClient(requireEnv('MONGO_CONNECTION_STRING'))
const db = client.db(mongoDBConfig.dbName)

export const auth = betterAuth({
  // Do not pass `client` to the adapter: that turns on transactions, which
  // need a replica set. OpenSlots must run on a standalone MongoDB.
  database: mongodbAdapter(db),
  // Google is the only sign-in method for real instances (S1-1); it is added
  // in slice 1B. Email and password exists only in fake mode, so tests and
  // local UI work can get a session without Google. See /dev/sign-in.
  emailAndPassword: {
    enabled: isFakeGoogle(),
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      accessType: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar.freebusy',
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
        'https://www.googleapis.com/auth/calendar.events',
      ],
    },
  },
  disabledPaths: ['/get-access-token', '/refresh-token', '/account-info'],
  // 1.7.25 invokes this inside the redirect-aware sign-in AND linking paths.
  // Use fresh provider identity, not the owner's email when linking another account.
  user: {
    validateUserInfo({ user, source }) {
      if (
        source.method === 'oauth' &&
        (!user.emailVerified || !isEmailAllowed(String(user.email ?? '')))
      ) {
        return { error: 'EMAIL_NOT_ALLOWED' }
      }
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (
            !isEmailAllowed(user.email) ||
            (!isFakeGoogle() && !user.emailVerified)
          ) {
            throw new APIError('FORBIDDEN', {
              code: 'EMAIL_NOT_ALLOWED',
              message: 'Account not allowed.',
            })
          }
        },
      },
    },
    session: {
      create: {
        before: async (session, context) => {
          const user = await context?.context.internalAdapter.findUserById(
            session.userId,
          )
          if (!user || !isEmailAllowed(user.email)) {
            throw new APIError('FORBIDDEN', {
              code: 'EMAIL_NOT_ALLOWED',
              message: 'Account not allowed.',
            })
          }
        },
        after: async (session, context) => {
          if (!isFakeGoogle() || !context) return
          const accounts = await context.context.internalAdapter.findAccounts(
            session.userId,
          )
          if (!accounts.some((account) => account.providerId === 'google')) {
            await context.context.internalAdapter.createAccount({
              userId: session.userId,
              providerId: 'google',
              accountId: session.userId,
              // Deliberately recognizable fake credentials let browser/log
              // tests detect accidental OAuth payload exposure.
              accessToken: 'fake-access-token-e2e-only',
              refreshToken: 'fake-refresh-token-e2e-only',
            })
          }
        },
      },
    },
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: { enabled: true, allowDifferentEmails: true },
  },
  onAPIError: { errorURL: '/login' },
  // nextCookies must stay the last plugin.
  plugins: [nextCookies()],
})
