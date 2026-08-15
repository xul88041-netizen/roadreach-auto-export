# Gmail API OAuth Setup

RoadReach Gmail sync is code-complete but remains disabled until credentials are created manually. It reads `xuli58836@gmail.com`; it does not modify Gmail.

## 1. Create a free Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project such as `RoadReach Auto Export CRM`.
3. Open **APIs & Services → Library** and enable **Gmail API**.
4. Open **Google Auth Platform / OAuth consent screen**.
5. Choose External if required, keep the app in Testing for the MVP, and add `xuli58836@gmail.com` as a test user.
6. Add only this scope: `https://www.googleapis.com/auth/gmail.readonly`.

Do not request Gmail modify, compose, send, delete or full-mailbox scopes.

Important: for an External OAuth app whose publishing status is **Testing**, Google normally makes a Gmail-scope refresh token expire after 7 days. That is acceptable for initial validation only. For continuing incremental sync, move the consent screen to **In production** and complete any Google verification/policy steps it requests, then issue and store a new refresh token. The sync UI reports token refresh failures instead of silently claiming success.

## 2. Create an OAuth client and refresh token

For a private one-admin MVP, the Google OAuth 2.0 Playground is the shortest auditable bootstrap path:

1. Create an OAuth client in Google Cloud. Choose **Web application**.
2. Add `https://developers.google.com/oauthplayground` as an authorized redirect URI.
3. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
4. Open the settings gear, enable **Use your own OAuth credentials**, and enter the new client ID and client secret.
5. In Step 1 enter `https://www.googleapis.com/auth/gmail.readonly`, then authorize using `xuli58836@gmail.com`.
6. In Step 2 exchange the authorization code and copy the refresh token once.

Treat the client secret and refresh token as passwords. Never paste them into this repository, GitHub variables, browser code, screenshots, issues or chat.

## 3. Store credentials as Supabase Function secrets

Run from a trusted terminal after linking the Supabase project:

```powershell
npx supabase secrets set GMAIL_CLIENT_ID="..." GMAIL_CLIENT_SECRET="..." GMAIL_REFRESH_TOKEN="..." GMAIL_MAILBOX="xuli58836@gmail.com"
```

Also set a random rate-limit salt and the allowed public origins:

```powershell
npx supabase secrets set RATE_LIMIT_SALT="a-long-random-value" ALLOWED_ORIGINS="https://xul88041-netizen.github.io,http://localhost:4173,http://127.0.0.1:4173"
```

Deploy functions:

```powershell
npx supabase functions deploy submit-inquiry
npx supabase functions deploy gmail-sync
```

`submit-inquiry` is public by design and has `verify_jwt = false` in `supabase/config.toml`. `gmail-sync` requires a valid administrator JWT and then checks the database allowlist.

## 4. Run and validate historical import

1. Sign in at `/admin/`.
2. Open **Email Sync**.
3. Run **Historical import**.
4. Review the result counts and inspect Customers and timelines.
5. Confirm that real two-way/explicit-requirement threads appear and Delivery Status Notification, mailer-daemon, automatic replies, social/Google notifications, newsletters, one-way outreach and ordinary ticket acknowledgements do not.
6. Review declined contacts; they should be `DECLINED` and Low priority.

The known real contacts in the project brief are validation examples only. Their addresses and companies are not hardcoded in the importer.

## 5. Incremental sync

The same function stores `last_history_id`, `last_synced_at` and result metadata in `gmail_sync_state`. **Run incremental sync** searches mail since the last sync and imports only:

- mail belonging to an existing CRM customer, or
- newly qualifying RoadReach business correspondence.

For the free MVP, incremental sync is manually triggered from Admin. A later scheduled invocation may call the authenticated function through a protected server job; never embed an administrator JWT or OAuth refresh token in public code.

## Revocation

If a credential is exposed:

1. Revoke the OAuth grant in the Google Account security page.
2. Rotate the Google client secret.
3. Replace/remove the Supabase Function secrets.
4. Review Supabase Function logs and CRM import activity.

Google references: [OAuth refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration), [Gmail server-side authorization](https://developers.google.com/workspace/gmail/api/auth/web-server).
