# Super Doge Telegram bot · Cloudflare Worker

The GitHub repo contains this bot backend; Cloudflare Workers runs it. Telegram hosts the “Super Doge Community” group, linked to @SuperDogeAgent. Use the existing @SuperDogeAgent Telegram bot and its BotFather token. This Worker powers group welcome/info replies and private temporary Solana-wallet registration. D1 stores pending entries and wallets. `/export` (admin-only, private chat) closes intake and sends a CSV to the admin. A UTC Cron Trigger deletes active D1 rows at `AIRDROP_DELETE_AFTER`.

## Configure

1. Create D1 database `superdoge-airdrop`; replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc` with its ID.
2. Apply `migrations/0001_initial.sql` with Wrangler.
3. Bind that D1 database as `DB`.
4. Add runtime variables `BOT_USERNAME` (`SuperDogeAgent`, without `@`), `ADMIN_TELEGRAM_ID`, `AIRDROP_CLOSES_AT`, and `AIRDROP_DELETE_AFTER` in Cloudflare. Dates must be ISO 8601 and include UTC (`Z`). Delete-after must be later than close.
5. Add encrypted secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`.
6. Deploy and set Telegram's webhook to `https://<worker-host>/telegram`, passing the identical webhook secret as Telegram's `secret_token`.

Use `npx wrangler d1 migrations apply superdoge-airdrop --remote --config bot/wrangler.jsonc` and `npx wrangler deploy --config bot/wrangler.jsonc` from the repository root.

The webhook path checks Telegram's secret-token header. Wallet intake is private-chat-only. The Worker does not check ownership, eligibility, or on-chain distribution. Telegram retains the CSV sent to the admin until that copy is deleted; the organizer must also delete any local/downloaded copies. D1 deletion clears active rows; review Cloudflare's database backup/restore and retention settings for your account before promising full erasure. This starter has not been independently audited.
