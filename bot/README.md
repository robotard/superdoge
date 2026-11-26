# Super Doge Telegram bot · Cloudflare Worker

The GitHub repo contains the bot backend; Cloudflare Workers runs it. Telegram hosts the “Super Doge Community” group linked to @SuperDogeAgent.

The bot welcomes new members, answers `/start` and `/info`, and handles private airdrop registration. For basic anti-spam, it deletes external links posted by members during their first 24 hours (official `superdoge.co` and `t.me/SuperDogeAgent` links are allowed) and deletes messages after 8 messages in 10 seconds. It does not mute or ban members.

## Configure

1. Create D1 database `superdoge-airdrop` and replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc` with its ID. The config binds it as `DB`.
2. Apply the schema and moderation migrations with Wrangler:

   `npx wrangler d1 migrations apply superdoge-airdrop --remote --config bot/wrangler.jsonc`

3. Add runtime variables `BOT_USERNAME` (`SuperDogeAgent`, without `@`), `ADMIN_TELEGRAM_ID`, `AIRDROP_CLOSES_AT`, and `AIRDROP_DELETE_AFTER` in Cloudflare. Dates must include UTC (`Z`), with deletion later than closing.
4. Add encrypted secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`.
5. Add @SuperDogeAgent to the Telegram group as an admin with the **Delete messages** permission. The bot needs to see group messages for moderation. It does not need restrict/ban rights. Pin a notice with the link and flood rules.
6. Deploy and set Telegram's webhook to `https://<worker-host>/telegram`, passing the same webhook secret as Telegram's `secret_token`.

As the configured admin, send `/export` privately to close intake and receive the wallet CSV. A UTC Cron Trigger deletes active D1 rows after `AIRDROP_DELETE_AFTER`; the organizer must also delete the Telegram CSV and any downloaded copies after distribution.

The Worker does not verify wallet ownership, eligibility, or on-chain distribution. This starter has not been independently audited.
