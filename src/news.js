import { FEEDS } from "./config.js";

export function stripHtml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

function tag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return stripHtml(match[1]);
  }
  return "";
}

export function parseFeed(xml, feed) {
  const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, 12).map((block) => {
    const title = tag(block, ["title"]);
    const url =
      tag(block, ["link", "guid", "id"]) ||
      block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ||
      "";
    const rawSummary = tag(block, ["description", "summary", "content:encoded", "content"]);
    const published = tag(block, ["pubDate", "published", "updated", "dc:date"]);
    const summary = rawSummary || `${title}. Open the source to read the full update.`;
    return {
      id: stableId(url || `${feed.source}:${title}`),
      title,
      summary: truncate(summary, 280),
      url,
      source: feed.source,
      source_tier: feed.tier,
      category: feed.category,
      published_at: safeDate(published)
    };
  }).filter((item) => item.title && item.url);
}

export async function collectStories(fetcher = fetch) {
  const settled = await Promise.allSettled(FEEDS.map(async (feed) => {
    const response = await fetcher(feed.url, {
      headers: { "User-Agent": "MorningLedger/0.1 (+https://github.com/)" }
    });
    if (!response.ok) throw new Error(`${feed.source}: HTTP ${response.status}`);
    return parseFeed(await response.text(), feed);
  }));

  const stories = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const errors = settled
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason.message);
  return { stories, errors };
}

export async function saveStories(db, stories) {
  let inserted = 0;
  for (const story of stories) {
    const result = await db.prepare(`
      INSERT OR IGNORE INTO stories
      (id, title, summary, url, source, source_tier, category, published_at, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      story.id,
      story.title,
      story.summary,
      story.url,
      story.source,
      story.source_tier,
      story.category,
      story.published_at,
      new Date().toISOString()
    ).run();
    inserted += result.meta?.changes || 0;
  }
  return inserted;
}

export function truncate(value, max = 280) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

export function stableId(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `story-${(hash >>> 0).toString(16)}`;
}

function safeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
