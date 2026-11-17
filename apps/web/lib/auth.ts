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
      mapProfileToUser(profile) {
        if (!isEmailAllowed(profile.email)) {
          throw new APIError('FORBIDDEN', {
            code: 'EMAIL_NOT_ALLOWED',
            message: 'This Google account is not allowed on this instance.',
          })
        }
        return {}
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
