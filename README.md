#EDIT herew anotherh ghj
zv
# Dudley Scores – Vercel + Browserless

This repo serves `/games.json` for your website. It supports two modes:

1. **Fallback/Dummy mode** (no Browserless token): returns sample `upcoming` and `results`.
2. **Live scraping mode** (with `BROWSERLESS_WS` env var): uses Playwright to connect to Browserless and scrape Play Rugby League pages (SPA).
 f
## Env Vars (Vercel → Project → Settings → Environment Variables)

- `SEASON_YEAR` = `2025`
- `CLUB_SLUG` = `dudley-redhead-junior-rlfc-inc-12074`
- `TZ` = `Australia/Sydney`
- `BROWSERLESS_WS` = `wss://chrome.browserless.io/playwright?token=YOUR_TOKEN` (optional until scraping)

## Files

- `vercel.json` – Cron every 6h → `/api/cron`, rewrite `/games.json` → `/api/games`
- `/api/games.ts` – returns cached JSON (or fetches if missing)
- `/api/cron.ts` – forces a refresh; called by Vercel Cron
- `/lib/data.ts` – cache + orchestrator (decides scrape vs fallback)
- `/lib/scrape.ts` – Playwright Browserless connection (stubbed selector logic, safe to deploy)
- `/lib/normalize.ts` – utilities (minis/mods score omission)

## First deploy (no scraper yet)

1. Commit & deploy to Vercel.
2. Open `/api/cron` once to seed cache.
3. Open `/games.json` – you’ll see dummy data.
4. Point your site at this URL.

## Turn on live scraping later

1. Get a Browserless account and copy your Playwright WebSocket URL (wss://.../playwright?token=...).
2. Add `BROWSERLESS_WS` in Vercel env vars and redeploy.
3. `/api/cron` will try scraping; if it fails, it falls back and logs the error.
