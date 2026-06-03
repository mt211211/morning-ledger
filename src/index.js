import { CATEGORIES, DEMO_STORIES } from "./config.js";
import { answerArticleQuestion } from "./chat.js";
import { collectStories, saveStories } from "./news.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/news" && request.method === "GET") return newsResponse(env, url);
    if (url.pathname === "/api/refresh" && request.method === "POST") return refreshResponse(env, "manual");
    if (url.pathname === "/api/chat" && request.method === "POST") return chatResponse(request, env);
    if (url.pathname === "/api/preferences" && request.method === "POST") return preferenceResponse(request, env);
    if (url.pathname === "/api/notifications" && request.method === "POST") return notificationResponse(request, env);
    if (url.pathname === "/api/notifications" && request.method === "DELETE") return deleteNotificationResponse(request, env);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(scheduledRefresh(env));
  }
};

async function newsResponse(env, url) {
  const category = CATEGORIES.includes(url.searchParams.get("category")) ? url.searchParams.get("category") : "all";
  const stories = await listStories(env, category);
  return json({
    stories: stories.map((story) => ({ ...story, bullets: storyBullets(story) })),
    updated_at: await getSetting(env, "last_refresh"),
    demo: !env.DB,
    turnstile_site_key: env.TURNSTILE_SITE_KEY || "",
    vapid_public_key: env.VAPID_PUBLIC_KEY || ""
  });
}

async function refreshResponse(env, triggerName) {
  if (!env.DB) return json({ new_count: 0, message: "Preview mode is already caught up.", updated_at: new Date().toISOString() });
  const started = new Date().toISOString();
  const run = await env.DB.prepare(
    "INSERT INTO refresh_runs (started_at, trigger_name, status) VALUES (?, ?, 'running')"
  ).bind(started, triggerName).run();
  const { stories, errors } = await collectStories();
  const inserted = await saveStories(env.DB, stories);
  const finished = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE refresh_runs SET completed_at = ?, new_story_count = ?, status = ?, details = ? WHERE id = ?"
  ).bind(finished, inserted, errors.length ? "partial" : "complete", errors.join("; "), run.meta.last_row_id).run();
  await setSetting(env, "last_refresh", finished);
  return json({
    new_count: inserted,
    message: inserted ? `${inserted} new finance stories loaded.` : "All caught up. No new finance stories found.",
    updated_at: finished,
    warnings: errors
  });
}

async function chatResponse(request, env) {
  const body = await request.json();
  const question = String(body.question || "").trim().slice(0, 500);
  if (!question) return json({ error: "Please enter a question." }, 400);
  const storyId = String(body.storyId || "").trim();
  if (!storyId) return json({ error: "Choose an article first, then ask Ledger about it." }, 400);

  const rateLimit = await checkAiRateLimit(request, env, body.turnstileToken);
  if (!rateLimit.allowed) {
    return json({
      error: "You've reached today's Ask Ledger limit. Please try again later.",
      retry_later: true
    }, 429);
  }

  const story = await getStory(env, storyId);
  if (!story) return json({ error: "I could not find that article in the current digest." }, 404);
  return json(await answerArticleQuestion(env, question, story));
}

async function preferenceResponse(request, env) {
  const body = await request.json();
  const timezone = String(body.timezone || "").slice(0, 80);
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    return json({ error: "Invalid timezone." }, 400);
  }
  if (env.DB) await setSetting(env, "timezone", timezone);
  return json({ timezone });
}

async function notificationResponse(request, env) {
  if (!env.DB) return json({ ok: true, preview: true });
  const body = await request.json();
  const timezone = String(body.timezone || env.DEFAULT_TIMEZONE || "UTC").slice(0, 80);
  const subscription = body.subscription;
  if (!subscription?.endpoint) return json({ error: "Missing push subscription." }, 400);
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    return json({ error: "Invalid timezone." }, 400);
  }
  await env.DB.prepare(`
    INSERT OR REPLACE INTO notification_subscriptions
    (endpoint, subscription_json, timezone, created_at, last_sent_at)
    VALUES (?, ?, ?, COALESCE((SELECT created_at FROM notification_subscriptions WHERE endpoint = ?), ?), NULL)
  `).bind(subscription.endpoint, JSON.stringify(subscription), timezone, subscription.endpoint, new Date().toISOString()).run();
  return json({ ok: true, message: "Morning notification saved." });
}

async function deleteNotificationResponse(request, env) {
  if (!env.DB) return json({ ok: true, preview: true });
  const body = await request.json();
  const endpoint = String(body.endpoint || "");
  if (!endpoint) return json({ error: "Missing push subscription endpoint." }, 400);
  await env.DB.prepare("DELETE FROM notification_subscriptions WHERE endpoint = ?").bind(endpoint).run();
  return json({ ok: true, message: "Morning notification disabled." });
}

async function scheduledRefresh(env) {
  const timezone = await getSetting(env, "timezone") || env.DEFAULT_TIMEZONE || "UTC";
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
  if (localTime === "07:30") await refreshResponse(env, "scheduled");
  await sendDueNotifications(env);
}

async function listStories(env, category = "all", limit = 60) {
  if (!env.DB) return DEMO_STORIES.filter((story) => category === "all" || story.category === category);
  const where = category === "all" ? "" : "WHERE category = ?";
  const statement = env.DB.prepare(`SELECT * FROM stories ${where} ORDER BY published_at DESC LIMIT ?`);
  const result = category === "all" ? await statement.bind(limit).all() : await statement.bind(category, limit).all();
  return result.results;
}

async function getStory(env, id) {
  if (!env.DB) return DEMO_STORIES.find((story) => story.id === id) || null;
  return env.DB.prepare("SELECT * FROM stories WHERE id = ?").bind(id).first();
}

async function getSetting(env, key) {
  if (!env.DB) return null;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row?.value || null;
}

async function checkAiRateLimit(request, env, turnstileToken) {
  if (!env.DB) return { allowed: true };
  const limit = Math.max(1, Number(env.AI_DAILY_IP_LIMIT || 60));
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "local";
  const clientKey = await sha256Hex(`${ip}:${request.headers.get("user-agent") || ""}`);
  const windowStart = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    "SELECT count FROM ai_rate_limits WHERE client_key = ? AND window_start = ?"
  ).bind(clientKey, windowStart).first();
  if ((row?.count || 0) >= limit) {
    const passedTurnstile = await verifyTurnstile(env, turnstileToken, ip);
    if (!passedTurnstile) return { allowed: false };
  }
  await env.DB.prepare(`
    INSERT INTO ai_rate_limits (client_key, window_start, count, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(client_key, window_start)
    DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
  `).bind(clientKey, windowStart, now).run();
  return { allowed: true };
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY || !token) return false;
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  form.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  const result = await response.json();
  return Boolean(result.success);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function storyBullets(story) {
  const cleaned = String(story.summary || "")
    .replace(new RegExp(`^${escapeRegExp(story.title)}[.\\s-]*`, "i"), "")
    .replace(/open the source to read the full update\.?/i, "")
    .trim();
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const first = sentences[0] || `${story.source} published an update related to ${story.category.replace("-", " ")}.`;
  const second = sentences[1] || `The story is categorized under ${story.category.replace("-", " ")} and may matter to readers tracking that area.`;
  return [shortBullet(first), shortBullet(second)];
}

function shortBullet(value) {
  return value.length > 130 ? `${value.slice(0, 127).trim()}...` : value;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function sendDueNotifications(env) {
  if (!env.DB || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const subscriptions = await env.DB.prepare(
    "SELECT endpoint, subscription_json, timezone, last_sent_at FROM notification_subscriptions LIMIT 500"
  ).all();
  for (const row of subscriptions.results || []) {
    const localTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: row.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(now);
    if (localTime !== "07:30" || String(row.last_sent_at || "").startsWith(today)) continue;
    const subscription = JSON.parse(row.subscription_json);
    try {
      await sendWebPush(subscription.endpoint, env);
      await env.DB.prepare(
        "UPDATE notification_subscriptions SET last_sent_at = ? WHERE endpoint = ?"
      ).bind(now.toISOString(), row.endpoint).run();
    } catch (error) {
      if ([404, 410].includes(error.status)) {
        await env.DB.prepare("DELETE FROM notification_subscriptions WHERE endpoint = ?").bind(row.endpoint).run();
      }
    }
  }
}

async function sendWebPush(endpoint, env) {
  const audience = new URL(endpoint).origin;
  const jwt = await createVapidJwt(audience, env);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      TTL: "43200",
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      "Crypto-Key": `p256ecdsa=${env.VAPID_PUBLIC_KEY}`
    }
  });
  if (!response.ok) {
    const error = new Error(`Push failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
}

async function createVapidJwt(audience, env) {
  const publicBytes = base64UrlToBytes(env.VAPID_PUBLIC_KEY);
  const x = bytesToBase64Url(publicBytes.slice(1, 33));
  const y = bytesToBase64Url(publicBytes.slice(33, 65));
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x,
    y,
    d: env.VAPID_PRIVATE_KEY,
    ext: true
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: "mailto:admin@morning-ledger.workers.dev"
  })));
  const input = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(input)
  ));
  return `${input}.${bytesToBase64Url(ecdsaToJose(signature))}`;
}

function ecdsaToJose(signature) {
  if (signature.length === 64) return signature;
  let offset = 3;
  let rLength = signature[offset - 1];
  if (signature[offset] === 0) {
    offset += 1;
    rLength -= 1;
  }
  const r = signature.slice(offset, offset + rLength);
  offset += rLength + 2;
  let sLength = signature[offset - 1];
  if (signature[offset] === 0) {
    offset += 1;
    sLength -= 1;
  }
  const s = signature.slice(offset, offset + sLength);
  const result = new Uint8Array(64);
  result.set(r.slice(-32), 32 - Math.min(r.length, 32));
  result.set(s.slice(-32), 64 - Math.min(s.length, 32));
  return result;
}

function base64UrlToBytes(value) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function setSetting(env, key, value) {
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, value).run();
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
