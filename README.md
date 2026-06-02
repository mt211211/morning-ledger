# Morning Ledger

Morning Ledger is an open-source, mobile-first finance news digest. It pulls short updates from credible free sources, refreshes automatically at 07:30 in the configured local timezone, and answers questions using the stories in the digest.

The interface is an installable Progressive Web App (PWA), so iPhone users can add it to their home screen without an App Store release.

Production: https://app.morning-ledger.workers.dev

## Features

- Bite-sized finance summaries with direct links to original articles
- Markets, company news, economy, personal finance, and crypto filters
- Scheduled refresh at 07:30 local time and manual refresh at any time
- Grounded chat responses with source links
- Offline shell for the most recently loaded interface
- Preview mode with representative cards when running locally
- Cloudflare Worker, D1, Cron Trigger, and Workers AI deployment

Cloudflare Cron Triggers run in UTC. Morning Ledger runs every 30 minutes and refreshes only when the stored IANA timezone reaches 07:30, including daylight-saving changes.

## Privacy and repository hygiene

Do not commit runtime news, local databases, chat history, secrets, or API keys. Cloudflare stores deployed data in D1 and environment secrets. The repository contains source code and schema only.

## Disclaimer

Morning Ledger is an informational news tool. It is not a financial adviser and does not provide personalized investment advice.
