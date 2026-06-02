import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { DEMO_STORIES } from "./src/config.js";
import { answerQuestion } from "./src/chat.js";

const port = Number(process.env.PORT || 8787);
const publicDir = join(process.cwd(), "public");

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === "/api/news") return sendJson(response, {
    stories: DEMO_STORIES.filter((story) => !url.searchParams.get("category") || url.searchParams.get("category") === "all" || story.category === url.searchParams.get("category")),
    updated_at: new Date().toISOString(),
    demo: true
  });
  if (url.pathname === "/api/refresh" && request.method === "POST") return sendJson(response, {
    new_count: 0,
    message: "All caught up. No new finance stories found.",
    updated_at: new Date().toISOString()
  });
  if (url.pathname === "/api/preferences" && request.method === "POST") return sendJson(response, { ok: true });
  if (url.pathname === "/api/chat" && request.method === "POST") {
    const body = await readBody(request);
    return sendJson(response, await answerQuestion({}, String(body.question || ""), DEMO_STORIES));
  }
  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const path = normalize(join(publicDir, relative));
  if (!path.startsWith(publicDir)) return send(response, 403, "Forbidden");
  try {
    if (!(await stat(path)).isFile()) throw new Error("Not found");
    return send(response, 200, await readFile(path), contentType(path));
  } catch {
    return send(response, 404, "Not found");
  }
}).listen(port, "0.0.0.0", () => console.log(`Morning Ledger preview: http://0.0.0.0:${port}`));

async function readBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || "{}");
}

function sendJson(response, value) {
  return send(response, 200, JSON.stringify(value), "application/json; charset=utf-8");
}

function send(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, { "content-type": type });
  response.end(body);
}

function contentType(path) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml"
  }[extname(path)] || "application/octet-stream";
}
