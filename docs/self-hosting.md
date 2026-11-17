# Self-hosting OpenSlots

This guide takes you from an empty server to a running OpenSlots instance that takes bookings into Google Calendar. Follow the steps in order. Every command and value you need is here. Replace the placeholder host name `book.your-domain.example` with your own everywhere it appears.

Background: [product requirements](PRD.md) and [technical requirements](TRD.md).

## 1. What you need

- A server or computer with Docker and the Docker Compose plugin. Check with `docker compose version`. It should print a version number. The repository does not state minimum hardware. The first build downloads and compiles packages, so give it some disk space and memory.
- A domain name, for example `book.your-domain.example`, pointing at the server, and HTTPS in front of the app. The guide uses a reverse proxy for HTTPS (section 5).
- A Google account for the business owner, and access to Google Cloud with it.
- Git, to copy the repository.
- About an hour for the first install. Most of that is the Google Cloud setup. This is an estimate.

OpenSlots runs as two containers: the app and a MongoDB database. The database is not reachable from outside the server.

## 2. Create the Google Cloud OAuth client

OpenSlots signs owners in with Google and reads and writes their Google Calendar. Each instance needs its own OAuth client. Google changes the names of its console screens from time to time. The names below are the ones Google Cloud shows, as written here. If a name differs, look for the nearest one.

### 2.1 Create a project

1. Open the [Google Cloud console](https://console.cloud.google.com/).
2. In the top bar, open the project picker and choose **New project**.
3. Enter a **Project name**, for example `OpenSlots`, and choose **Create**.
4. Make sure the new project is selected in the project picker.

### 2.2 Enable the Google Calendar API

1. Go to **APIs & Services**, then **Library**.
2. Search for `Google Calendar API`, open it and choose **Enable**.

### 2.3 Configure the consent screen

The consent screen is the page Google shows the owner when they connect OpenSlots. In current consoles it is under **Google Auth Platform**. Older consoles call it **OAuth consent screen**.

1. Open **Google Auth Platform**. If you see **Get started**, choose it.
2. Under **Branding** (or **App information**), enter:
   - **App name**: a name the owner will recognize, for example `OpenSlots`.
   - **User support email**: an email address you read.
3. Under **Audience**, choose **External** as the user type. Use **Internal** only for a Google Workspace organization whose users are the only ones who will sign in. OpenSlots is for any owner who signs in.
4. Under **Contact information**, enter an email address Google can use to contact you about the project.
5. Choose **Create** or **Finish** to save the consent screen.

### 2.4 Add the scopes the app requests

A scope is a permission the owner grants on Google's consent screen. OpenSlots requests exactly these three, as set in `apps/web/lib/auth.ts`:

| Scope | What OpenSlots uses it for |
| --- | --- |
| `https://www.googleapis.com/auth/calendar.freebusy` | Asks Google which times a calendar is busy, so customers are offered only free times. Google returns times only. |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | Lists the calendars on the connected account and whether each one can take bookings. |
| `https://www.googleapis.com/auth/calendar.events` | Creates, changes and cancels the booking events. This is broader than it sounds. Bookings can go to a shared calendar that the owner can write to, and Google allows that only with this scope. |

OpenSlots never reads event titles or details. Its code calls Google only to create, change and delete the events it makes for bookings. It never lists or reads other events.

To add the scopes:

1. Under **Data Access** (or **Scopes**), choose **Add or remove scopes**.
2. Search for each scope above, tick it, and choose **Update**. Then choose **Save**.

If the scope list does not match these three, do not continue. The app checks for all three and reports a reconnect problem when one is missing.

### 2.5 Publish the app: move it from "Testing" to "In production"

Do this step. Skipping it breaks calendar access every week.

1. Under **Audience**, find the **Publishing status**. It says **Testing**.
2. Choose **Publish app**, then confirm.
3. Check that the status now says **In production**.

Why this matters: an OAuth app in **Testing** gets refresh tokens that expire after seven days. OpenSlots keeps calendar access alive by refreshing its tokens. In Testing, every calendar connection stops working after seven days, and the owner sees **Needs reconnect** each week. See [docs/google-validation.md](google-validation.md) for the source of this rule.

Google's "unverified app" warning: while the app is not verified, the owner may see a screen saying Google has not verified it. For an instance that only its owner uses, the owner can continue past that screen. Google's screen puts the way past it under **Advanced**. Google may limit how many accounts can use an unverified app, and it may ask you to verify the app for calendar scopes on a public instance. The rules are Google's, and this project has not checked them against a live account. See [section 11](#11-verifying-against-real-google).

### 2.6 Create the OAuth client

1. Go to **Clients** (under **Google Auth Platform**), or **APIs & Services**, then **Credentials**.
2. Choose **Create client**, or **Create credentials**, then **OAuth client ID**.
3. For **Application type**, choose **Web application**.
4. Enter a **Name**, for example `OpenSlots your-domain`.
5. Under **Authorized JavaScript origins**, add your public origin:

   ```text
   https://book.your-domain.example
   ```

6. Under **Authorized redirect URIs**, add this exact address:

   ```text
   https://book.your-domain.example/api/auth/callback/google
   ```

   `/api/auth/callback/google` is Better Auth's default callback path for Google. Google sign-in and connecting more calendars both return to it. The app serves Better Auth at `apps/web/app/api/auth/[...all]/route.ts`. The scheme, host and path must match `BETTER_AUTH_URL` plus that path exactly. A trailing slash is a mismatch.

7. Choose **Create**.
8. Copy the **Client ID** and the **Client secret** from the dialog. You will paste them into `.env` in section 3. Keep the secret private. Do not paste it into chat, issues or logs.

## 3. Configure

### 3.1 Create `.env`

Clone the repository and copy the example file to `.env` in the repository root. Docker Compose reads this file.

```sh
git clone https://github.com/harryt04/openslots.git
cd openslots
cp .env.example .env
```

Open `.env` in an editor and fill in the values described below. Do not commit `.env`. The repository's `.gitignore` and `.dockerignore` already keep it out of Git and out of the image.

Generate the `BETTER_AUTH_SECRET` value on the server:

```sh
openssl rand -base64 32
```

Paste the output as the value of `BETTER_AUTH_SECRET`. Use a new random value for each instance. Do not change it after the first start. Stored Google tokens are encrypted with it.

### 3.2 Who can sign in

> **Read this before you start the instance.** `OPENSLOTS_ALLOWED_EMAILS` controls who can sign in. When it is **unset or empty**, any Google account can sign in to your instance and create businesses on it. Set it to your own email address (and any other owners you trust) before you let the instance be reachable on the internet.

### 3.3 Variables

Every variable in `.env.example` and `docker-compose.yml` is listed here.

Use this table to fill in `.env`. "Required" means Docker Compose refuses to start without it.

| Name | Required | What it does | Example |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | Yes | Secret used to sign sessions and to encrypt the stored Google tokens. Use a new random value, and keep it. | Output of `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Yes | The public address customers and owners use. Use the origin only: `https`, your host name, no path, no trailing slash. | `https://book.your-domain.example` |
| `GOOGLE_CLIENT_ID` | Yes | Client ID from section 2.6. | `123456789-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Yes | Client secret from section 2.6. | `GOCSPX-...` |
| `OPENSLOTS_ALLOWED_EMAILS` | Strongly recommended | Comma-separated list of Google accounts allowed to sign in. Matching ignores case and spaces. If it is unset, any Google account can sign in. | `owner@example.com,partner@example.com` |
| `TRUSTED_PROXY_HOPS` | No, default `0` | How many reverse proxies sit in front of the app. The app uses the address that the proxy appends to `X-Forwarded-For` to rate-limit by IP. `0` disables per-IP limits. See section 5. | `1` |
| `API_SLOTS_IP_LIMIT` | No, default `60` | Per-minute limit per client IP for reading open times. Used only when `TRUSTED_PROXY_HOPS` is above `0`. | `60` |
| `API_WRITE_IP_LIMIT` | No, default `10` | Per-minute limit per client IP for write requests: booking, cancelling and rescheduling. Used only when `TRUSTED_PROXY_HOPS` is above `0`. | `10` |
| `API_SLOTS_KEY_LIMIT` | No, default `600` | Per-minute limit per business publishable key for reading open times. Applies with or without a proxy. | `600` |
| `API_WRITE_KEY_LIMIT` | No, default `100` | Per-minute limit per business publishable key for write requests. Applies with or without a proxy. | `100` |
| `NEXT_PUBLIC_POSTHOG_KEY` | No, default empty | Turns on analytics for signed-in pages when set. It is read at build time, so changing it needs a rebuild. See section 8. | `your-posthog-project-key` |
| `OPENSLOTS_PORT` | No, default `3000` | Port on the server's loopback address (`127.0.0.1`) where the app is published. Set in `docker-compose.yml` only, not in `.env.example`. | `3000` |
| `E2E_FAKE_GOOGLE` | Never set it | Test-only switch that replaces Google with an in-memory fake and enables a test sign-in. The app stops when it is set in production. Do not set it. | (leave unset) |

Two more variables matter mostly outside Docker:

| Name | Required | What it does | Example |
| --- | --- | --- | --- |
| `MONGO_CONNECTION_STRING` | Set by Compose | Database address. `docker-compose.yml` sets it to `mongodb://mongo:27017`, so you do not set it for Docker. Without Docker it is required (section 10). | `mongodb://localhost:27017` |
| `OPENSLOTS_AUTO_INDEX` | No | Set to `0` to stop the app creating its MongoDB indexes at start. You must then create them yourself, which the Docker image cannot do. Leave it unset with Docker. See section 4.3. | `0` |

## 4. Start it

From the repository root:

```sh
docker compose up -d --build
```

The first run builds the image, which takes a few minutes. It then starts the `app` container and the `mongo` container. The database has no published port, so nothing outside the server can reach it.

### 4.1 Check that it is healthy

Check the containers:

```sh
docker compose ps
```

The `app` service shows `healthy` after its first successful check. That can take up to a minute after start. The image's own health check calls `/api/health` inside the container. The `mongo` service shows `healthy` once its ping succeeds.

Check the app's health endpoint on the server:

```sh
curl -fsS http://127.0.0.1:3000/api/health
```

It returns `{"ok":true}` when the app can reach the database. It returns HTTP 503 with `{"ok":false}` when it cannot. The endpoint says nothing else about the instance.

Read the logs:

```sh
docker compose logs --tail=100 app
```

A healthy start logs lines like these, from `apps/web/lib/mongo-utils.ts`:

```text
Ensuring indexes for db: openslots-production ...
Indexes ensured for db: openslots-production
```

### 4.2 What happens at the first start

When the app starts in production, it creates the MongoDB collections and indexes it needs. It does this on every start, and repeating it is harmless. The unique index on `slot_locks` is the one that stops two customers booking the same time. If index creation fails, the app keeps running so you can sign in and read the logs. Booking then answers with an internal error until the index exists. See [troubleshooting](#13-troubleshooting).

### 4.3 Creating indexes yourself

You do not need to. If you would rather the app never created indexes, set `OPENSLOTS_AUTO_INDEX=0` in `.env` and restart. You must then create them before taking bookings, from a checkout of the repository on a machine that can reach the database:

```sh
NODE_ENV=production MONGO_CONNECTION_STRING=mongodb://your-database-host:27017 pnpm run create-indexes
```

The Docker image contains only the built server, not this script, and the compose file does not publish the database port. So with the compose setup, leave `OPENSLOTS_AUTO_INDEX` unset.

## 5. Reverse proxy and HTTPS

The app listens on `127.0.0.1:3000` on the server by default. Only programs on the same server can reach it. Your reverse proxy listens on the public ports 80 and 443, serves HTTPS, and forwards requests to the app.

### 5.1 Rules for the proxy

- **One host name.** Serve the instance on one host name only, the one in `BETTER_AUTH_URL`. Redirect every alias, such as `www.`, to that host name at the proxy. Pages reached through another host name can render, but they cannot reach the API, so customers see a failure. The examples below include the redirect.
- **`BETTER_AUTH_URL` must be exactly the public address customers use:** the scheme, the host name, and nothing else. Sign-in and the Google redirect use this value.
- **`TRUSTED_PROXY_HOPS` is the number of proxies in front of the app.** With one proxy, set it to `1`. The app takes the address the proxy appends to `X-Forwarded-For`. The nginx example below appends it. Check that your proxy appends the client address too, and does not pass on a header the client sent.
- **With `TRUSTED_PROXY_HOPS=0`** (the default), the app does not rate-limit by IP address. Its only rate limit is the per-key limit. Every visitor of one business shares that business's per-key limit (600 reads and 100 writes per minute by default). Set `TRUSTED_PROXY_HOPS` to `1` once you are behind a proxy.
- **When `TRUSTED_PROXY_HOPS` is set, the app port must be reachable only through the proxy.** Otherwise a client could send a fake `X-Forwarded-For` header. The `127.0.0.1` binding does this on a single server. If your proxy is on another machine, you must change the binding and block direct access to the port with a firewall. This guide does not cover that layout.
- **Redact manage links in the access log.** A manage link (`/m/…`) and its API path (`/api/v1/manage/…`) hold a bearer credential. Anyone with the link can cancel or move that booking. Do not let these paths reach the access log, or redact them. The examples below stop logging them.

### 5.2 Example: Caddy

Caddy gets certificates for the host names it serves automatically. The directives below need a Caddy version that supports `log_skip`. Check with `caddy validate` before you reload.

```text
book.your-domain.example {
	@manage path /m/* /api/v1/manage/*
	log_skip @manage
	reverse_proxy 127.0.0.1:3000
}

www.your-domain.example {
	redir https://book.your-domain.example{uri} permanent
}
```

### 5.3 Example: nginx

The `map` block must sit in the `http` context, for example in a file in `/etc/nginx/conf.d/`. It sets a variable that tells `access_log` to skip manage links. Add certificate lines where the comments say. The certificate setup depends on your tooling.

```nginx
map $request_uri $openslots_loggable {
    ~^/m/              0;
    ~^/api/v1/manage/  0;
    default            1;
}

server {
    listen 443 ssl;
    server_name book.your-domain.example;
    # TLS certificate lines go here.

    access_log /var/log/nginx/openslots.access.log combined if=$openslots_loggable;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 443 ssl;
    server_name www.your-domain.example;
    # TLS certificate lines go here too.

    return 301 https://book.your-domain.example$request_uri;
}
```

Test and reload:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Nginx's error log can also record request lines for some upstream errors. Check that log too.

### 5.4 Coolify

The maintainer deploys on Coolify. The steps below are a guide. They have not been checked against a current Coolify release.

1. Create a new application from the Git repository.
2. Choose to build from the **Dockerfile** at the repository root, or from **docker-compose.yml**. The Dockerfile builds only the app, so for a database you also need MongoDB, either the compose file or a MongoDB service of your own.
3. Set the variables from section 3.3 in the application's environment settings. Set `TRUSTED_PROXY_HOPS=1`, because Coolify's proxy sits in front of the app.
4. Set the application port to `3000`.
5. Set the health check path to `/api/health`.
6. Set the domain to the host name in `BETTER_AUTH_URL`. Coolify's proxy handles HTTPS. Redirect any `www.` alias to that host name as well, if Coolify supports it.
7. Keep port 3000 off the public internet. The compose file publishes it on `127.0.0.1` only. Whether Coolify still needs that host binding depends on its routing. Check Coolify's current documentation.

## 6. First run

Do this in a browser, using the public address. Do not use `localhost` or `127.0.0.1`. Sign-in redirects to `BETTER_AUTH_URL`.

1. Open `https://book.your-domain.example/login`. Choose **Continue with Google**.
2. Sign in with a Google account listed in `OPENSLOTS_ALLOWED_EMAILS`. Google shows the permissions. Leave every permission ticked. If one is unticked, the calendar shows **Needs reconnect** later (see [troubleshooting](#13-troubleshooting)).
3. On **Name your business**, enter the business name, the URL slug, and the timezone. Choose **Create business**. The name is what customers see on the booking page.
4. Open **Availability**. Set the weekly hours and choose **Save changes**.
5. Open **Calendars**. Under **Connect your calendars**, choose **Connect** next to your Google account. Under **No booking calendar**, find the calendar you want. Choose **Receive bookings here**. Its badge then reads **New bookings go here**.
6. For any calendar whose events should block customers, turn on **Blocks slots** for that calendar.
7. Open **Services** and choose **New service**. Enter a name and a duration, and set the other fields as the form shows. Save it.
8. On the **Services** page, choose the copy button on the service's card. Its accessible label is `Copy link to` followed by the service name. The link has this form:

   ```text
   https://book.your-domain.example/b/your-business-slug/your-service-slug
   ```

9. Open the link in a private browser window. Check that open times appear.

## 7. Embedding in another site

Customers can book on the hosted page without any setup. To put the booking picker inside your own site, use the Developers page.

1. Open **Developers**. The **Publishable key** is shown there. The key is safe in browser code. Keep manage links private.
2. Under **Allowed sites**, add the origin of each site that will show the picker, for example `https://example.com`. Use the origin only: scheme and host, no path. Plain `http` is allowed only for `localhost`. Your own instance's origin is always allowed.
3. Copy the snippet from the **Install and embed** section. It is filled in with your host name and key. It looks like this:

   ```tsx
   import { BookingFlow } from '@openslots/react'
   import '@openslots/react/styles.css'

   export default function Book() {
     return (
       <BookingFlow
         host="https://book.your-domain.example"
         publishableKey="os_pk_replace-with-your-key"
       />
     )
   }
   ```

**`@openslots/react` is not yet published to npm.** The repository has the package at version `0.0.0`, and publishing it is a step the maintainer approves. The `pnpm add @openslots/react` line on the Developers page will fail until the package is published. Until then, you can build your own picker on the public API. The routes are under `/api/v1` on your instance, and their request and response shapes are in [docs/TRD.md section 7](TRD.md#7-public-api-apiv1). Send the key in the `X-OpenSlots-Key` header.

The hosted booking pages can be embedded by other sites. Manage pages (`/m/…`) can be framed only by your own instance.

## 8. Analytics

Analytics are off by default. They turn on only when you pass `NEXT_PUBLIC_POSTHOG_KEY` when you build the image, because the key is written into the browser code at build time. To change it, set it in `.env` and run `docker compose up -d --build`.

What the code does, from `apps/web/providers/posthogProvider.tsx` and `apps/web/app/(public)/layout.tsx`:

- Analytics load only in a production build with a key set.
- The signed-in admin pages record page views only, with no query strings. Autocapture and session recording are off, and all text and attributes are masked.
- Booking pages and manage pages never load analytics. The `(public)` layout does not mount the provider, and their Content Security Policy does not allow analytics hosts.
- Events go through the app's `/ingest` path, which the app forwards to PostHog's US servers.

## 9. Upgrading and backups

### 9.1 Upgrading

Back up first (section 9.2). Then:

```sh
cd openslots
git pull
docker compose up -d --build
```

The database volume stays in place. The app creates any new indexes when it starts. Check the health endpoint afterwards:

```sh
curl -fsS http://127.0.0.1:3000/api/health
```

Do not change `BETTER_AUTH_SECRET` during an upgrade.

### 9.2 Backups

Back up the database and your `.env` file. The `.env` file holds `BETTER_AUTH_SECRET`. The stored Google tokens are encrypted with it, so a database backup without the matching secret cannot decrypt them, and every calendar would need reconnecting.

Keep backups outside the repository, with restricted permissions.

First check that the image has `mongodump`. The repository does not confirm this for `mongo:8`:

```sh
docker compose exec mongo sh -c 'command -v mongodump'
```

If that prints a path, make a backup:

```sh
BACKUP_DIR="$HOME/openslots-backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
docker compose exec -T mongo mongodump --archive > "$BACKUP_DIR/openslots-$(date +%F).archive"
cp .env "$BACKUP_DIR/env-$(date +%F)"
chmod 600 "$BACKUP_DIR"/*
```

If `command -v mongodump` prints nothing, this backup method does not work with this image. This guide does not yet cover another method.

To restore, stop the app first so it does not write during the restore:

```sh
docker compose stop app
docker compose exec -T mongo mongorestore --archive --drop < "$HOME/openslots-backups/openslots-2026-11-17.archive"
docker compose start app
```

Replace the archive name with your own file.

### 9.3 What the instance holds about customers

From [docs/TRD.md section 9](TRD.md#9-security-and-privacy) and the code:

- For each booking: the customer's name, email address, and optional phone number and notes, as the service asks for them, plus the booking's time and status.
- The booking is also a Google Calendar event. The customer is added as a guest, and the event description holds the manage link. Anyone the owner has shared that calendar with, at "see all event details", can read the link.
- The manage link is stored only as a hash. The app keeps no copy of the token itself.
- For each owner: their Google account identity, and their Google access and refresh tokens, encrypted with `BETTER_AUTH_SECRET`. Sessions.
- Short-lived rate-limit counters.

The app does not track customers. Analytics, if you turn them on, cover signed-in admin pages only.

## 10. Running without Docker

Use this path if you want to run the app yourself, for example under systemd. You need:

- Node.js 26. The repository's `.nvmrc` pins `26.13.0`, and `package.json` requires `26.x`.
- pnpm 11.28.12, the version pinned in `package.json` under `packageManager`. Install it with:

  ```sh
  npm install -g pnpm@11.28.12
  ```

- A MongoDB server. The Docker setup uses `mongo:8`. The repository does not test other versions. OpenSlots does not use multi-document transactions, so a standalone server is enough.

Install the workspace and build it. The build needs placeholder values for three variables. They are used only to build. The real values are read when the server starts.

```sh
pnpm install --frozen-lockfile
MONGO_CONNECTION_STRING=mongodb://localhost:27017 \
BETTER_AUTH_SECRET=build-placeholder-not-used-at-runtime \
BETTER_AUTH_URL=http://localhost:3000 \
pnpm run build
```

Start the app with the real values in its environment (for example in a systemd unit):

```sh
export NODE_ENV=production
export MONGO_CONNECTION_STRING=mongodb://localhost:27017
export BETTER_AUTH_SECRET=replace-with-your-secret
export BETTER_AUTH_URL=https://book.your-domain.example
export GOOGLE_CLIENT_ID=replace-with-client-id
export GOOGLE_CLIENT_SECRET=replace-with-client-secret
export OPENSLOTS_ALLOWED_EMAILS=owner@example.com
export TRUSTED_PROXY_HOPS=1
pnpm --filter @openslots/web start
```

`NODE_ENV=production` matters. The database name is `openslots-<NODE_ENV>`, so `openslots-production` is the production database. Without it, the app uses a different database.

The app listens on port 3000 by default. Put your reverse proxy in front of it (section 5). The health endpoint is `/api/health`.

## 11. Verifying against real Google

The automated tests in this repository run against a fake Google Calendar. They do not prove that Google's consent, token refresh or calendar behavior works for a real account. [docs/google-validation.md](google-validation.md) is the manual checklist for that. It covers sign-in and consent, refresh after expiry, revoked access, `linkSocial` for a second account, and the calendar tombstone behaviour that the code depends on.

At the time of writing, these checks have not been run against a live Google account. Run the checklist on your own instance before you rely on it. It is also the place to confirm the scope and publishing steps in section 2.

## 12. Known limits in v1

- **You cannot reschedule a booking to a time that overlaps its own current time.** Cancel the booking and book again.
- **Booking correctness depends on a unique index, not on transactions.** A standalone MongoDB has no transactions. The app relies on the unique `slot_locks` index. The app creates it at start (unless you turn that off), and it checks the index before it accepts a booking.
- **A rare orphan event can remain in Google Calendar.** If the server dies after Google accepts a new event but before the app finishes its clean-up, the event can stay in the calendar. Google can also apply a write it has already accepted up to an hour late. Check the connected calendar after a crash.
- **App server clocks must agree.** If more than one app server runs, their clocks must agree, because booking time windows depend on them. A single container has no such problem.
- **One calendar owner per business.** Several staff members per business are not supported.
- **Google Calendar only.** No other calendar provider is supported.
- **Manage links are bearer credentials.** Anyone with a manage link can cancel or move that booking. Keep them out of logs and off shared calendars (section 5.1 and section 9.3).

## 13. Troubleshooting

**"Needs reconnect" appears every week.** The OAuth client is still in **Testing**. Move it to **In production** (section 2.5). Then reconnect each affected calendar on **Calendars**, using the **Reconnect** button. Signing out and in again does not repair a calendar.

**"Needs reconnect" appears right after you connect.** You unticked a permission on Google's consent screen. Reconnect the calendar on **Calendars** with every permission ticked. Plain sign-in does not update the stored permissions.

**Sign-in fails with `redirect_uri_mismatch`.** The redirect URI in the Google console does not match `BETTER_AUTH_URL` plus `/api/auth/callback/google`. Compare them character by character: scheme, host name, path, no trailing slash. Also check that the Client ID and secret in `.env` belong to that same client.

**Sign-in says "Sign-in refused. Your Google account is not allowed on this instance."** The Google account is not in `OPENSLOTS_ALLOWED_EMAILS`, or Google did not verify its email address. Add the email to the list and restart the app with `docker compose up -d`.

**Customers see "We couldn't connect".** The browser blocks the booking widget's requests in two cases:

- The page's host name is not the one in `BETTER_AUTH_URL`. An alias such as `www.` is one example. Redirect the alias at the proxy (section 5.1).
- The site that embeds the widget is not in **Allowed sites** on the Developers page. Add it, using the origin only.

Check also that the snippet's `host` is your instance's address and that the publishable key is current. The key changes if you rotate it.

**Customers see no times.** Check these, in order:

- **Online booking is paused because the business's calendar needs attention.** A calendar connection is broken. Fix it on **Calendars**.
- **No booking calendar** on **Calendars**. Choose **Receive bookings here** for a calendar you can write to.
- **Availability.** Weekly hours and date overrides must leave open time.
- **Service settings.** Check the minimum notice and the booking window. A window that ends before the next open time leaves nothing to offer.
- **No open times in this month.** The picker shows this when a month has no open times. Use the month buttons to look at other months.

**Bookings fail with "Something went wrong on our side", and the logs mention indexes.** The app could not create the MongoDB indexes at start, so it refuses bookings for safety. The logs say one of these:

```text
OpenSlots could not create its MongoDB indexes. Bookings stay disabled until they exist.
OpenSlots booking refused: unique slot_locks or cap_locks index missing. Run create-indexes.
```

Check that the database is reachable with `docker compose logs app` and `curl -fsS http://127.0.0.1:3000/api/health`. Then restart the app, which creates the indexes again: `docker compose restart app`. 

**Customers see "Too many attempts" for everyone.** The per-key limit is shared by all visitors of one business. With the default of 100 writes per minute, a busy page can hit it. If the proxy also sets `X-Forwarded-For` to its own address, all visitors share one IP bucket. Check the `X-Forwarded-For` header your proxy sends, and check that `TRUSTED_PROXY_HOPS` matches the number of proxies. The `Retry-After` header tells a client how long to wait.

## Security notes

These come from the project's security review. They repeat points made above because each one is easy to get wrong.

- **Restrict who can sign in.** With `OPENSLOTS_ALLOWED_EMAILS` unset, anyone with a Google account can sign in to your instance and create businesses on it. Removing an address from the list stops new sign-ins by that account. It does not end sessions that account already has.
- **A manage link is a password.** Anyone who has a booking's `/m/…` link can cancel or move that booking. The link is in the customer's calendar invitation and in the description of the event on your calendar, so anyone you share that calendar with at "See all event details" can use it. Keep `/m/` and `/api/v1/manage/` paths out of your proxy's access log (section 5).
- **The publishable key is public.** It is meant to be in browser code. It can read a business's services and open times and create bookings, and nothing else. The list of allowed sites stops other websites' pages from using it in a browser. It does not stop a script that is not a browser, which is what the rate limits are for. Rotate the key on the Developers page if it is being abused.
- **Rate limits need the proxy setting.** With `TRUSTED_PROXY_HOPS=0` there is no per-visitor limit, only a per-business one, so one visitor can use up a business's allowance for a minute. Set it to the number of proxies in front of the app, and make sure the app's port cannot be reached except through the proxy, or a visitor can forge their address.
- **One host name.** Serve the instance only at the address in `BETTER_AUTH_URL` and use HTTPS. Sign-in cookies are marked secure only when that address is `https://`.
- **Never set `E2E_FAKE_GOOGLE` on a real instance.** It replaces Google with a fake and enables a test sign-in. The server refuses to start with it in production, and CI checks that against the built image.
- **Google tokens** are stored encrypted with `BETTER_AUTH_SECRET` and never sent to the browser. If you change that secret, every calendar connection has to be reconnected and everyone is signed out. Keep it safe and back it up with your `.env`.
- **Analytics** are off unless you build with a PostHog key. They are never loaded on booking or manage pages, and on signed-in pages they record page views only, without customer names, emails or search terms.
- **What has not been verified.** Everything in this project was tested against a fake Google Calendar. Sign-in, consent, token refresh, invitations and reconnecting have not been run against a real Google account. Work through [google-validation.md](google-validation.md) on your own instance before relying on it.
