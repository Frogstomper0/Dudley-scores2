// api/cron.ts
import { scrapeAll } from "../lib/scrape";

export async function GET(req: Request) {
  // Optional: verify it's Vercel Cron hitting you
  const ua = req.headers.get("user-agent") ?? "";
  const isCron = ua.includes("vercel-cron/1.0"); // Vercel sets this UA
  // if you want to require cron only, uncomment:
  // if (!isCron) return new Response("forbidden", { status: 403 });

  try {
    const ws = process.env.BROWSERLESS_WS;
    if (!ws) throw new Error("Missing BROWSERLESS_WS");

    const club = process.env.CLUB_SLUG ?? "dudley-redhead";
    const season = Number(process.env.SEASON_YEAR ?? new Date().getFullYear());

    const data = await scrapeAll({ ws, clubSlug: club, seasonYear: season, timezone: "Australia/Sydney" });

    // TODO: optionally cache to KV here

    return Response.json({ ok: true, updated: data.updated }, { headers: { "cache-control": "no-store" } }); // 200
  } catch (err) {
    console.error("cron error:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 }); // signals failure
  }
}
