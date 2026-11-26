const INFO = "Super Doge ($SDOGE) is a Solana meme coin with a Shiba mascot in pixel sunglasses, built around a fair launch and a community-first approach.\n\nProject website: https://superdoge.co";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function commandOf(text = "") {
  const match = text.trim().match(/^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s|$)/i);
  return match ? match[1].toLowerCase() : "";
}

function isPrivate(message) {
  return message.chat?.type === "private";
}

function utcDate(value, name) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.valueOf())) throw new Error(`Missing or invalid ${name}`);
  return date;
}

async function telegram(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method} failed`);
  return result.result;
}

async function say(env, chatId, text) {
  return telegram(env, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

function configuredIds(value) {
  return String(value || "").split(",").map((part) => Number(part.trim())).filter(Number.isSafeInteger);
}

function adminIds(env) {
  // Keep ADMIN_TELEGRAM_ID as a backwards-compatible fallback for an existing single-admin setup.
  return configuredIds(env.ADMIN_TELEGRAM_IDS || env.ADMIN_TELEGRAM_ID);
}

function isModerator(env, userId) {
  const ids = [...adminIds(env), ...configuredIds(env.MODERATOR_IDS)];
  return ids.includes(Number(userId));
}

function externalUrls(text) {
  return text.match(/(?:https?:\/\/|www\.)[^\s<>()]+|(?:t\.me|telegram\.me)\/[^\s<>()]+/gi) || [];
}

function isAllowedProjectUrl(value) {
  const cleaned = value.replace(/[.,!?;:]+$/, "");
  const normalized = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (host === "superdoge.co" || host === "www.superdoge.co") return true;
    return host === "t.me" && url.pathname.replace(/\/+$/, "").toLowerCase() === "/superdogeagent";
  } catch {
    return false;
  }
}

async function moderateGroupMessage(env, message) {
  const chat = message.chat;
  if (!chat || !["group", "supergroup"].includes(chat.type) || !message.from || message.from.is_bot || isModerator(env, message.from.id)) return;
  const content = message.text || message.caption || "";
  const now = Math.floor(Date.now() / 1000);

  const joined = await env.DB.prepare("SELECT joined_at FROM group_members WHERE chat_id = ? AND telegram_user_id = ?")
    .bind(chat.id, message.from.id).first();
  const isNewMember = joined && now - joined.joined_at < 86400;
  if (isNewMember && externalUrls(content).some((url) => !isAllowedProjectUrl(url))) {
    await telegram(env, "deleteMessage", { chat_id: chat.id, message_id: message.message_id });
    await say(env, chat.id, `Links are disabled for new members for their first 24 hours, ${message.from.first_name || "friend"}. Official Super Doge links are allowed.`);
    return;
  }

  await env.DB.prepare(`
    INSERT INTO message_windows (chat_id, telegram_user_id, window_started_at, message_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT (chat_id, telegram_user_id) DO UPDATE SET
      message_count = CASE WHEN message_windows.window_started_at >= excluded.window_started_at - 10 THEN message_windows.message_count + 1 ELSE 1 END,
      window_started_at = CASE WHEN message_windows.window_started_at >= excluded.window_started_at - 10 THEN message_windows.window_started_at ELSE excluded.window_started_at END
  `).bind(chat.id, message.from.id, now).run();
  const rate = await env.DB.prepare("SELECT window_started_at, message_count FROM message_windows WHERE chat_id = ? AND telegram_user_id = ?")
    .bind(chat.id, message.from.id).first();
  if (rate && now - rate.window_started_at < 10 && rate.message_count > 8) {
    await telegram(env, "deleteMessage", { chat_id: chat.id, message_id: message.message_id });
    if (rate.message_count === 9) await say(env, chat.id, `${message.from.first_name || "Member"}, please slow down—more than 8 messages in 10 seconds is treated as flooding.`);
  }
}

function validSolanaAddress(address) {
  if (address.length < 32 || address.length > 44) return false;
  let number = 0n;
  for (const char of address) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) return false;
    number = number * 58n + BigInt(digit);
  }
  const leadingZeroes = address.match(/^1*/)?.[0].length ?? 0;
  let decodedLength = leadingZeroes;
  while (number > 0n) {
    decodedLength += 1;
    number >>= 8n;
  }
  return decodedLength === 32;
}

async function isClosed(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'closed'").first();
  return row?.value === "yes";
}

async function beginRegistration(env, message) {
  const { DB } = env;
  const closed = await isClosed(DB);
  const closesAt = utcDate(env.AIRDROP_CLOSES_AT, "AIRDROP_CLOSES_AT");
  const deleteAfter = utcDate(env.AIRDROP_DELETE_AFTER, "AIRDROP_DELETE_AFTER");
  if (deleteAfter <= closesAt) throw new Error("AIRDROP_DELETE_AFTER must be later than AIRDROP_CLOSES_AT");
  if (closed || Date.now() >= closesAt.valueOf()) {
    await say(env, message.chat.id, "Airdrop registration is closed.");
    return;
  }
  const closes = closesAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const deletes = deleteAfter.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  await DB.prepare("INSERT OR REPLACE INTO pending (telegram_user_id, created_at) VALUES (?, ?)")
    .bind(message.from.id, new Date().toISOString()).run();
  await say(env, message.chat.id,
    `Temporary $SDOGE airdrop registration. Send your public Solana wallet address to enter. Never send a seed phrase or private key.\n\n` +
    `Your wallet address and Telegram account ID will be used to administer this airdrop, prevent duplicate entries, and prepare the distribution list. By sending an address, you agree to this use.\n\n` +
    `Registration closes ${closes}. Entries in the bot database are scheduled for deletion after ${deletes}. The CSV sent to the organizer must also be deleted by the organizer after distribution.\n\n` +
    `Project info: https://superdoge.co\nSend your wallet address now, or /cancel.`);
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function exportEntries(env, message) {
  if (!isPrivate(message) || !adminIds(env).includes(Number(message.from.id))) {
    await say(env, message.chat.id, "That admin command is restricted.");
    return;
  }
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('closed', 'yes')").run();
  const { results = [] } = await env.DB.prepare("SELECT wallet FROM entries ORDER BY created_at, wallet").all();
  const csv = ["solana_wallet", ...results.map((row) => csvCell(row.wallet))].join("\r\n") + "\r\n";
  const body = new FormData();
  body.set("chat_id", String(message.chat.id));
  body.set("caption", `Registration closed. ${results.length} unique wallet(s) exported. Delete this file after the distribution.`);
  body.set("document", new Blob([csv], { type: "text/csv;charset=utf-8" }), "superdoge-airdrop.csv");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: "POST", body });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error("CSV could not be sent to the admin");
}

async function handleMessage(env, message) {
  if (!message?.from || message.from.is_bot) return;
  const chat = message.chat;
  if (message.new_chat_members?.length) {
    const members = message.new_chat_members.filter((member) => !member.is_bot);
    const joinedAt = Math.floor(Date.now() / 1000);
    for (const member of members) {
      await env.DB.prepare("INSERT OR REPLACE INTO group_members (chat_id, telegram_user_id, joined_at) VALUES (?, ?, ?)")
        .bind(chat.id, member.id, joinedAt).run();
    }
    if (members.length) {
      const names = members.map((member) => member.first_name || "Doge fan").join(", ");
      await say(env, chat.id, `Welcome, ${names}! 🐶🕶️\nThis is the Super Doge Community. Be kind and watch out for scams. Use /info for project details. For the temporary airdrop, message @${env.BOT_USERNAME} privately and send /airdrop.`);
    }
    return;
  }

  const command = commandOf(message.text || "");
  if (command === "start" || command === "info") {
    await say(env, chat.id, `${command === "start" ? "Welcome to Super Doge 🐶🕶️\n\n" : ""}${INFO}${isPrivate(message) ? "\n\nCommands: /info · /airdrop · /cancel" : "\n\nUse /airdrop here for the private registration link."}`);
    return;
  }
  if (command === "airdrop") {
    if (!isPrivate(message)) {
      await say(env, chat.id, `To keep wallet addresses private, open @${env.BOT_USERNAME} and send /airdrop there: https://t.me/${env.BOT_USERNAME}`);
    } else {
      await beginRegistration(env, message);
    }
    return;
  }
  if (command === "cancel" && isPrivate(message)) {
    await env.DB.prepare("DELETE FROM pending WHERE telegram_user_id = ?").bind(message.from.id).run();
    await say(env, chat.id, "Registration cancelled. No wallet address was saved.");
    return;
  }
  if (command === "export" || command === "close") {
    await exportEntries(env, message);
    return;
  }

  if (!isPrivate(message)) {
    await moderateGroupMessage(env, message);
    return;
  }

  if (message.text) {
    const pending = await env.DB.prepare("SELECT telegram_user_id FROM pending WHERE telegram_user_id = ?")
      .bind(message.from.id).first();
    if (!pending) {
      await say(env, chat.id, "I can share Super Doge info or register a temporary airdrop wallet. Try /info or /airdrop.");
      return;
    }
    if (await isClosed(env.DB) || Date.now() >= utcDate(env.AIRDROP_CLOSES_AT, "AIRDROP_CLOSES_AT").valueOf()) {
      await env.DB.prepare("DELETE FROM pending WHERE telegram_user_id = ?").bind(message.from.id).run();
      await say(env, chat.id, "Airdrop registration is closed.");
      return;
    }
    const wallet = message.text.trim();
    if (!validSolanaAddress(wallet)) {
      await say(env, chat.id, "That doesn’t look like a Solana wallet address. Send the public address only, or /cancel.");
      return;
    }
    const duplicate = await env.DB.prepare("SELECT telegram_user_id FROM entries WHERE telegram_user_id = ? OR wallet = ?")
      .bind(message.from.id, wallet).first();
    if (duplicate) {
      await env.DB.prepare("DELETE FROM pending WHERE telegram_user_id = ?").bind(message.from.id).run();
      await say(env, chat.id, "This Telegram account or wallet address is already registered. Only one entry is allowed.");
      return;
    }
    await env.DB.prepare("INSERT INTO entries (telegram_user_id, wallet, created_at) VALUES (?, ?, ?)")
      .bind(message.from.id, wallet, new Date().toISOString()).run();
    await env.DB.prepare("DELETE FROM pending WHERE telegram_user_id = ?").bind(message.from.id).run();
    await say(env, chat.id, "Address registered. Thanks! Your public wallet address is saved for this temporary airdrop.");
  }
}

function constantTimeEqual(left = "", right = "") {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return new Response("Super Doge bot is ready.");
    if (url.pathname !== "/telegram" || request.method !== "POST") return new Response("Not found", { status: 404 });
    if (!env.TELEGRAM_WEBHOOK_SECRET || !constantTimeEqual(request.headers.get("x-telegram-bot-api-secret-token") || "", env.TELEGRAM_WEBHOOK_SECRET)) {
      return new Response("Unauthorized", { status: 401 });
    }
    try {
      const update = await request.json();
      if (update.message) await handleMessage(env, update.message);
      return new Response("ok");
    } catch {
      return new Response("Update failed", { status: 500 });
    }
  },

  async scheduled(_event, env) {
    const statements = [
      env.DB.prepare("DELETE FROM group_members WHERE joined_at < unixepoch() - 86400"),
      env.DB.prepare("DELETE FROM message_windows WHERE window_started_at < unixepoch() - 60"),
    ];
    const deleteAfter = utcDate(env.AIRDROP_DELETE_AFTER, "AIRDROP_DELETE_AFTER");
    if (Date.now() >= deleteAfter.valueOf()) {
      statements.push(
        env.DB.prepare("DELETE FROM entries"),
        env.DB.prepare("DELETE FROM pending"),
        env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('closed', 'yes')"),
      );
    }
    await env.DB.batch(statements);
  },
};


