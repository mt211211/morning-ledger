import { truncate } from "./news.js";

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const STOP_WORDS = new Set([
  "about", "today", "what", "should", "know", "does", "this", "that", "with",
  "from", "latest", "happening", "matter", "there", "have", "tell", "more",
  "please", "ledger", "news"
]);

const CATEGORY_TERMS = {
  crypto: ["crypto", "bitcoin", "ethereum", "token", "stablecoin"],
  markets: ["market", "markets", "stock", "stocks", "shares", "trading"],
  companies: ["company", "companies", "business", "sec", "earnings"],
  economy: ["economy", "economic", "inflation", "rates", "federal", "reserve", "jobs"],
  "personal-finance": ["personal", "finance", "budget", "consumer", "debt", "mortgage", "saving"]
};

export function rankStories(stories, question, limit = 6) {
  const terms = (question.toLowerCase().match(/[a-z0-9]{3,}/g) || [])
    .filter((term) => !STOP_WORDS.has(term));
  return stories
    .map((story) => {
      const haystack = `${story.title} ${story.summary} ${story.category} ${story.source}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      const categoryBoost = CATEGORY_TERMS[story.category]?.some((term) => terms.includes(term)) ? 3 : 0;
      return { ...story, score: score + categoryBoost };
    })
    .filter((story) => story.score > 0)
    .sort((a, b) => b.score - a.score || b.published_at.localeCompare(a.published_at))
    .slice(0, limit);
}

export function classifyQuestion(question) {
  const normalized = question.toLowerCase();
  const advicePattern = /\b(should i|should we|buy|sell|invest in|put money|portfolio|my savings|my pension|my 401k|recommend)\b/;
  if (advicePattern.test(normalized)) return "personal-advice";
  const educationPattern = /\b(what is|what are|explain|define|how does|how do|meaning of|basics of)\b/;
  if (educationPattern.test(normalized)) return "education";
  return "digest";
}

export async function answerQuestion(env, question, stories) {
  const questionType = classifyQuestion(question);
  if (questionType === "personal-advice") {
    return {
      answer: "I cannot provide personalized investment advice or tell you what to buy or sell. I can explain the relevant news, define financial terms, and help you list factors to research before speaking with a qualified adviser.",
      citations: []
    };
  }

  const ranked = rankStories(stories, question);
  if (questionType === "education" && env.ENABLE_AI === "true" && env.AI) {
    const result = await env.AI.run(AI_MODEL, {
      messages: [
        {
          role: "system",
          content: "You are Morning Ledger, a finance education assistant. Explain concepts clearly and briefly. If the answer is general education, say it is a general explanation, not today's news. Do not cite or name external sources unless source context was explicitly provided. Do not include a Source line. Do not provide personalized investment advice."
        },
        { role: "user", content: `Question: ${question}` }
      ],
      max_tokens: 360
    });
    return { answer: stripUnsupportedSources(result.response), citations: [] };
  }

  if (questionType === "education") {
    return {
      answer: generalFinanceAnswer(question),
      citations: []
    };
  }

  if (!ranked.length) {
    return {
      answer: "I do not have enough matching stories in the current digest to answer that well. Try refreshing the feed, or ask about markets, companies, the economy, personal finance, or crypto.",
      citations: []
    };
  }

  if (env.ENABLE_AI === "true" && env.AI) {
    const context = ranked.map((story, index) =>
      `[${index + 1}] ${story.title}\nSource: ${story.source}\nSummary: ${story.summary}\nURL: ${story.url}`
    ).join("\n\n");
    const result = await env.AI.run(AI_MODEL, {
      messages: [
        {
          role: "system",
          content: "Answer finance-news questions using only the supplied digest context. Cite claims with [1], [2], and so on. Explain uncertainty clearly. Do not provide personalized investment advice."
        },
        { role: "user", content: `Digest context:\n${context}\n\nQuestion: ${question}` }
      ],
      max_tokens: 420
    });
    return { answer: result.response, citations: ranked };
  }

  const top = ranked.slice(0, 3);
  const answer = [
    "Here are the most relevant items currently in your digest:",
    ...top.map((story, index) => `${index + 1}. ${story.title}: ${truncate(story.summary, 190)}`),
    "Open the cited sources for the complete reporting. AI answers can be enabled during Cloudflare deployment."
  ].join("\n\n");
  return { answer, citations: top };
}

export async function answerArticleQuestion(env, question, story) {
  const questionType = classifyQuestion(question);
  if (questionType === "personal-advice") {
    return {
      answer: "I cannot provide personalized investment advice or tell you what to buy or sell. I can explain what this article says, why it may matter, and which factors a reader may want to research further.",
      citations: [story]
    };
  }

  if (env.ENABLE_AI === "true" && env.AI) {
    const result = await env.AI.run(AI_MODEL, {
      messages: [
        {
          role: "system",
          content: "Answer using only the single article context provided. Keep the answer tied to that article, even if the user asks a broader question. If the question asks for a definition, explain the concept only as it relates to the article. Cite the article as [1]. Do not use or name outside sources. Do not provide personalized investment advice."
        },
        {
          role: "user",
          content: `Article [1]\nTitle: ${story.title}\nSource: ${story.source}\nCategory: ${story.category}\nSummary: ${story.summary}\nURL: ${story.url}\n\nQuestion: ${question}`
        }
      ],
      max_tokens: 380
    });
    return { answer: stripUnsupportedSources(result.response), citations: [story] };
  }

  return {
    answer: [
      `This answer is limited to the article "${story.title}".`,
      `${story.summary}`,
      "Open the article link for the complete reporting. AI answers can be enabled during Cloudflare deployment."
    ].join("\n\n"),
    citations: [story]
  };
}

function stripUnsupportedSources(answer) {
  return String(answer || "")
    .split("\n")
    .filter((line) => !/^\s*(source|sources)\s*:/i.test(line))
    .join("\n")
    .replace(/\s+(source|sources)\s*:\s*[^.]+\.?$/i, "")
    .trim();
}

function generalFinanceAnswer(question) {
  const normalized = question.toLowerCase();
  if (normalized.includes("crypto") || normalized.includes("cryptocurrency")) {
    return "Crypto, short for cryptocurrency, is a type of digital asset that uses cryptography and often a blockchain to record transactions. Bitcoin and Ethereum are two well-known examples. This is a general explanation, not a summary of today's digest, and it is not investment advice.";
  }
  if (normalized.includes("stock") || normalized.includes("share")) {
    return "A stock, also called a share, represents partial ownership in a company. Stock prices move based on company performance, expectations, interest rates, broader market sentiment, and many other factors. This is a general explanation, not investment advice.";
  }
  if (normalized.includes("inflation")) {
    return "Inflation is the rate at which prices for goods and services rise over time. When inflation is high, money buys less than before, which can affect wages, savings, interest rates, and household budgets. This is a general explanation, not today's digest.";
  }
  return "This is a general finance question. In the deployed AI version, Ledger can explain concepts in plain English while keeping news-based answers tied to digest sources. I cannot provide personalized investment advice.";
}
