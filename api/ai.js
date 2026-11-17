// POST /api/ai — relays one prompt (plus optional photos) to Claude and returns the parsed JSON answer.
// The page writes every prompt and asks for "JSON only"; this function only adds the API key.
// With { web: true } Claude may search the web first (product lookups), and the pages it read come back as `sources`.
import Anthropic from "@anthropic-ai/sdk";

// Web searches take longer than a plain answer: vercel.json gives this function up to 60 s.

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const EFFORTS = ["low", "medium", "high"];
const WEB_MAX_USES = Number(process.env.WEB_SEARCH_MAX_USES || 4); // searches per request — each one is billed
const MAX_CONTINUES = 3; // a long search turn can pause; resume it at most this many times

export default async function handler(req, res) {
  if (!allowOrigin(req, res)) return res.status(403).json({ error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const { prompt, images = [], effort = "low", web = false } = req.body || {};
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 20000) {
    return res.status(400).json({ error: "bad_prompt" });
  }
  if (!Array.isArray(images) || images.length > 2 ||
      images.some((im) => !im || !IMAGE_TYPES.includes(im.type) || typeof im.data !== "string")) {
    return res.status(400).json({ error: "bad_images" });
  }
  const useWeb = web === true && process.env.WEB_SEARCH !== "off";

  const messages = [{
    role: "user",
    content: [
      ...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.type, data: im.data } })),
      { type: "text", text: prompt },
    ],
  }];

  try {
    let response;
    const content = [];
    for (let turn = 0; ; turn++) {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        // On a safety decline the API retries on a fallback model inside the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: EFFORTS.includes(effort) ? effort : "low" },
        system: "You are a JSON API for a Korean makeup app. Reply with exactly one JSON value and no other text."
          + (useWeb ? " Use web search to check real, current product listings before answering; never invent products or shade names." : ""),
        ...(useWeb ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: WEB_MAX_USES }] } : {}),
        messages,
      });
      content.push(...response.content);
      // A paused server-tool turn is resumed by sending it back as the assistant turn.
      if (response.stop_reason !== "pause_turn" || turn >= MAX_CONTINUES) break;
      messages.push({ role: "assistant", content: response.content });
    }

    if (response.stop_reason === "refusal") return res.status(422).json({ error: "refused" });
    // The JSON is in the final answer's text; with search results it can be split over several text blocks.
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const data = parseJson(text);
    if (data === undefined) return res.status(502).json({ error: "invalid_json" });
    return res.status(200).json({ data, ...(useWeb ? { sources: collectSources(content) } : {}) });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "rate_limited" });
    if (error instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: "server_key_invalid" });
    if (error instanceof Anthropic.BadRequestError) return res.status(400).json({ error: "bad_request" });
    if (error instanceof Anthropic.APIError) return res.status(502).json({ error: "upstream_error", status: error.status });
    return res.status(500).json({ error: "server_error" });
  }
}

// Pages the search returned (deduplicated, max 6). A failed search returns an error object instead of a list.
function collectSources(blocks) {
  const seen = new Set(), out = [];
  for (const b of blocks) {
    if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
    for (const r of b.content) {
      if (r.type !== "web_search_result" || !r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      out.push({ url: r.url, title: String(r.title || "").slice(0, 80) });
    }
  }
  return out.slice(0, 6);
}

// Same tolerance as the page's built-in path: the whole reply, a fenced block, or the outermost {…}/[…].
function parseJson(text) {
  const tries = [text, (text.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1]];
  const start = text.search(/[{[]/), end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start >= 0 && end > start) tries.push(text.slice(start, end + 1));
  for (const s of tries) {
    if (!s) continue;
    try { return JSON.parse(s); } catch { /* try the next shape */ }
  }
  return undefined;
}

// Same-origin requests carry no Origin or match the host. ALLOWED_ORIGINS (comma-separated)
// lets other sites call this; anything else is refused so strangers can't spend your credits.
export function allowOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  let originHost = "";
  try { originHost = new URL(origin).host; } catch { /* "null" from file:// pages */ }
  if (originHost === host || allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    return true;
  }
  return false;
}
