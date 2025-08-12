/**
 * /api/cron – refresh endpoint hit by Vercel Cron (and you can call it manually).
 * - Tries to refresh the cache (scrape if BROWSERLESS_WS present; else fallback).
 */
import { refreshGamesJson } from "../lib/data.js";

export default async function handler(req, res) {
  try {
    const { data, source } = await refreshGamesJson();
    res.setHeader("content-type", "application/json");
    res.status(200).send(JSON.stringify({ ok: true, source, updated: data.updated }, null, 2));
  } catch (err) {
    console.error("GET /api/cron error:", err);
    res.status(500).json({ error: "cron_failed", message: String(err) });
  }
}