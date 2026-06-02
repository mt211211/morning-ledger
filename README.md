# Morning Ledger

Morning Ledger is an open-source, mobile-first finance news digest. It pulls short updates from credible free sources, refreshes automatically at 07:30 in the configured local timezone, and answers questions using the stories in the digest.

The interface is an installable Progressive Web App (PWA), so iPhone users can add it to their home screen without an App Store release.

## Features

- Bite-sized finance summaries with direct links to original articles
- Markets, company news, economy, personal finance, and crypto filters
- Scheduled refresh at 07:30 local time and manual refresh at any time
- Grounded chat responses with source links
- Offline shell for the most recently loaded interface
- Preview mode with representative cards when running locally
- Cloudflare Worker, D1, Cron Trigger, and Workers AI deployment

## Local preview

```powershell
node local-preview.mjs
```

Open `http://localhost:8787`. To preview on another device on the same Wi-Fi network, open `http://YOUR_COMPUTER_LAN_IP:8787`.

## Cloudflare deployment

1. Install dependencies with `npm install`.
2. Log in with `npx wrangler login`.
3. Create a D1 database with `npx wrangler d1 create morning-ledger`.
4. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.jsonc`.
5. Apply the schema with `npm run db:remote`.
6. Deploy with `npm run deploy`.
7. Set `ENABLE_AI` to `true` in `wrangler.jsonc` when you want Workers AI responses.

If your Cloudflare account has not registered a `workers.dev` subdomain yet, Wrangler will ask you to do that in the Cloudflare dashboard before the first public deployment URL can go live.

Cloudflare Cron Triggers run in UTC. Morning Ledger runs every 30 minutes and refreshes only when the stored IANA timezone reaches 07:30, including daylight-saving changes.

## Privacy and repository hygiene

Do not commit runtime news, local databases, chat history, secrets, or API keys. Cloudflare stores deployed data in D1 and environment secrets. The repository contains source code and schema only.

## Disclaimer

Morning Ledger is an informational news tool. It is not a financial adviser and does not provide personalized investment advice.
