/**
 * /api/games – returns the current games JSON.
 * - If cache is fresh, returns it.
 * - If empty or stale, will try to refresh (scrape if BROWSERLESS_WS is set; otherwise fallback).
 */
import { getGamesJson } from "../lib/data.js";

export default async function handler(req, res) {
  try {
    const data = await getGamesJson({ preferFresh: false });
    res.setHeader("content-type", "application/json");
    res.status(200).send(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("GET /api/games error:", err);
    res.status(500).json({ error: "games_failed", message: String(err) });
  }
}