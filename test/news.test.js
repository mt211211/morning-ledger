import test from "node:test";
import assert from "node:assert/strict";
import { parseFeed, stableId, stripHtml, truncate } from "../src/news.js";
import { answerArticleQuestion, answerQuestion, classifyQuestion, rankStories } from "../src/chat.js";

test("parses RSS stories into compact feed cards", () => {
  const items = parseFeed(`
    <rss><channel><item>
      <title>Markets &amp; rates move</title>
      <link>https://example.com/story</link>
      <description><![CDATA[<p>A useful <strong>summary</strong>.</p>]]></description>
      <pubDate>Tue, 02 Jun 2026 07:30:00 GMT</pubDate>
    </item></channel></rss>
  `, { source: "Example", tier: "Official", category: "markets" });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Markets & rates move");
  assert.equal(items[0].summary, "A useful summary.");
});

test("ranks digest stories against the question", () => {
  const ranked = rankStories([
    { title: "Bitcoin changes", summary: "Crypto markets", category: "crypto", source: "CoinDesk", published_at: "2026-01-01" },
    { title: "Federal Reserve update", summary: "Interest rates", category: "economy", source: "Fed", published_at: "2026-01-02" }
  ], "What did the Federal Reserve say about rates?");
  assert.equal(ranked[0].source, "Fed");
});

test("does not pad unrelated answers when nothing matches", () => {
  const ranked = rankStories([
    { title: "Federal Reserve update", summary: "Interest rates", category: "economy", source: "Fed", published_at: "2026-01-02" }
  ], "what happened to orange juice futures?");
  assert.equal(ranked.length, 0);
});

test("category questions prefer the matching category", () => {
  const ranked = rankStories([
    { title: "Market briefing", summary: "Stocks and trading", category: "markets", source: "CNBC", published_at: "2026-01-02" },
    { title: "Bitcoin update", summary: "Digital assets", category: "crypto", source: "CoinDesk", published_at: "2026-01-01" }
  ], "what is happening with crypto today?");
  assert.equal(ranked[0].source, "CoinDesk");
});

test("classifies education and personal advice questions", () => {
  assert.equal(classifyQuestion("What is crypto?"), "education");
  assert.equal(classifyQuestion("Should I buy Bitcoin?"), "personal-advice");
});

test("answers general crypto question without digest citations in preview mode", async () => {
  const result = await answerQuestion({}, "What is crypto?", []);
  assert.match(result.answer, /general explanation/i);
  assert.equal(result.citations.length, 0);
});

test("strips unsupported source lines from education model answers", async () => {
  const result = await answerQuestion({
    ENABLE_AI: "true",
    AI: {
      run: async () => ({ response: "General explanation.\n\nSource: Example" })
    }
  }, "What is crypto?", []);
  assert.equal(result.answer, "General explanation.");
});

test("article scoped answers cite only the selected article", async () => {
  const story = {
    id: "story-1",
    title: "Bitcoin update",
    summary: "Bitcoin moved after investors reacted to market news.",
    url: "https://example.com/bitcoin",
    source: "Example",
    category: "crypto"
  };
  const result = await answerArticleQuestion({}, "What is crypto?", story);
  assert.match(result.answer, /limited to the article/i);
  assert.deepEqual(result.citations, [story]);
});

test("article scoped AI answers receive one-article context", async () => {
  let prompt = "";
  const story = {
    id: "story-1",
    title: "Company earnings",
    summary: "The company reported earnings.",
    url: "https://example.com/earnings",
    source: "Example",
    category: "companies"
  };
  const result = await answerArticleQuestion({
    ENABLE_AI: "true",
    AI: {
      run: async (_model, request) => {
        prompt = request.messages.at(-1).content;
        return { response: "It matters because of earnings. Source: Outside" };
      }
    }
  }, "Why does this matter?", story);
  assert.match(prompt, /Article \[1\]/);
  assert.match(prompt, /Company earnings/);
  assert.doesNotMatch(result.answer, /Source:/);
  assert.equal(result.citations.length, 1);
});

test("text helpers remain deterministic", () => {
  assert.equal(stripHtml("<p>Hello&nbsp;world</p>"), "Hello world");
  assert.equal(stableId("abc"), stableId("abc"));
  assert.equal(truncate("123456", 5), "1234…");
});
