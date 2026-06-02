import { CATEGORIES, DEMO_STORIES } from "./config.js";
import { answerArticleQuestion, answerQuestion } from "./chat.js";
import { collectStories, saveStories } from "./news.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/news" && request.method === "GET") return newsResponse(env, url);
    if (url.pathname === "/api/refresh" && request.method === "POST") return refreshResponse(env, "manual");
    if (url.pathname === "/api/chat" && request.method === "POST") return chatResponse(request, env);
    if (url.pathname === "/api/preferences" && request.method === "POST") return preferenceResponse(request, env);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(scheduledRefresh(env));
  }
};

async function newsResponse(env, url) {
  const category = CATEGORIES.includes(url.searchParams.get("category")) ? url.searchParams.get("category") : "all";
  const stories = await listStories(env, category);
  return json({ stories, updated_at: await getSetting(env, "last_refresh"), demo: !env.DB });
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
  if (storyId) {
    const story = await getStory(env, storyId);
    if (!story) return json({ error: "I could not find that article in the current digest." }, 404);
    return json(await answerArticleQuestion(env, question, story));
  }
  const stories = await listStories(env, "all", 80);
  return json(await answerQuestion(env, question, stories));
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

async function scheduledRefresh(env) {
  const timezone = await getSetting(env, "timezone") || env.DEFAULT_TIMEZONE || "UTC";
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
  if (localTime === "07:30") await refreshResponse(env, "scheduled");
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

async function setSetting(env, key, value) {
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, value).run();
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
