# Morning Ledger

Morning Ledger is an open-source, mobile-first finance news digest. It pulls short updates from credible free sources, refreshes automatically at 07:30 in the configured local timezone, and answers questions using the stories in the digest.

The interface is an installable Progressive Web App (PWA), so iPhone users can add it to their home screen without an App Store release.

Production: https://app.morning-ledger.workers.dev

## Features

- Bite-sized finance summaries with direct links to original articles
- Markets, company news, economy, personal finance, and crypto filters
- Scheduled refresh at 07:30 local time and manual refresh at any time
- Grounded chat responses with source links
- Optional 07:30 local-time push notifications for installed PWAs
- Offline shell for the most recently loaded interface
- Preview mode with representative cards when running locally
- Cloudflare Worker, D1, Cron Trigger, and Workers AI deployment

Cloudflare Cron Triggers run in UTC. Morning Ledger runs every 30 minutes and refreshes only when the stored IANA timezone reaches 07:30, including daylight-saving changes.

## Abuse Controls

Ask Ledger is article-scoped and rate-limited per IP address. The default is `60` AI questions per UTC day, configured by `AI_DAILY_IP_LIMIT` in `wrangler.jsonc`. If the limit is reached, users see a friendly retry-later message.

Turnstile is optional. Set `TURNSTILE_SITE_KEY` in `wrangler.jsonc` and `TURNSTILE_SECRET_KEY` as a Cloudflare secret to challenge users who hit the rate limit.

## Notifications

Morning Ledger supports Web Push notifications for installed PWAs. Users can turn the 07:30 alert on or off from the site. When enabled, the scheduled Worker sends a no-payload push at the user's stored local 07:30; the service worker displays "Morning Ledger is ready" and opens the app when the notification is tapped.

Set `VAPID_PUBLIC_KEY` in `wrangler.jsonc` and store `VAPID_PRIVATE_KEY` as a Cloudflare secret. Do not commit VAPID private keys.

## Privacy and repository hygiene

Do not commit runtime news, local databases, chat history, secrets, or API keys. Cloudflare stores deployed data in D1 and environment secrets. The repository contains source code and schema only.

## Disclaimer

Morning Ledger is an informational news tool. It is not a financial adviser and does not provide personalized investment advice.
