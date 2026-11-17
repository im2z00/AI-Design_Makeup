// GET /api/shop?q=… — Naver Shopping search: product name, photo, lowest price, shop name, link.
import { allowOrigin } from "./ai.js";

const strip = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export default async function handler(req, res) {
  if (!allowOrigin(req, res)) return res.status(403).json({ error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const q = String(req.query.q || "").trim().slice(0, 60);
  if (!q) return res.status(400).json({ error: "missing_query" });
  const id = process.env.NAVER_CLIENT_ID, secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return res.status(501).json({ error: "not_configured" });

  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(q)}&display=10&sort=sim`;
  const r = await fetch(url, { headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret } });
  if (!r.ok) return res.status(502).json({ error: "naver_error", status: r.status });

  const json = await r.json();
  const items = (json.items || []).map((it) => ({
    title: strip(it.title),
    image: it.image,
    lprice: Number(it.lprice) || 0,
    mallName: it.mallName,
    link: it.link,
    brand: it.brand,
    category: [it.category1, it.category2, it.category3, it.category4].filter(Boolean).join(" > "),
  }));
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
  return res.status(200).json({ items });
}
