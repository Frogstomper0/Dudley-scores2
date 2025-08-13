// @ts-nocheck
/**
 * Orchestrates cache + scrape/fallback.
 * For now, we use in-memory cache. This is fine to prove the pipeline.
 * Later you can plug Vercel KV/Redis if you want cross-instance persistence.
 */
import { scrapeAll } from "./scrape.js";
import { minisModsNoScore } from "./normalize.js";
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
// In-memory cache (per serverless instance)
let CACHE = null;
let CACHE_AT = 0;
function sampleData() {
    const updated = new Date().toISOString();
    const upcoming = [
        {
            date: "2025-08-15T14:00:00+10:00",
            grade: "U15 Div 1",
            homeTeam: "Dudley Redhead",
            awayTeam: "South Newcastle",
            venue: "John Balcomb Field",
            source: "sample"
        }
    ];
    const results = [
        {
            date: "2025-08-09T10:00:00+10:00",
            grade: "U13 Div 2",
            homeTeam: "Macquarie",
            awayTeam: "Dudley Redhead",
            scoreHome: 12,
            scoreAway: 18,
            status: "FT",
            source: "sample"
        },
        {
            date: "2025-08-10T09:00:00+10:00",
            grade: "U9",
            homeTeam: "Dudley Redhead",
            awayTeam: "Central",
            // Minis/Mods – omit scores by rule
            scoreHome: null,
            scoreAway: null,
            status: "FT",
            source: "sample"
        }
    ];
    // ensure minis/mods have scores omitted
    const resultsSanitized = results.map(g => minisModsNoScore(g));
    return { updated, club: "Dudley Redhead JRLFC", season: Number(process.env.SEASON_YEAR || 2025), upcoming, results: resultsSanitized };
}
export async function getGamesJson({ preferFresh = false } = {}) {
    const now = Date.now();
    if (!preferFresh && CACHE && (now - CACHE_AT) < MAX_AGE_MS) {
        return CACHE;
    }
    // if stale/empty, try to refresh
    const { data } = await refreshGamesJson();
    return data;
}
export async function refreshGamesJson() {
    const ws = process.env.BROWSERLESS_WS;
    const clubSlug = process.env.CLUB_SLUG || "dudley-redhead-junior-rlfc-inc-12074";
    const seasonYear = Number(process.env.SEASON_YEAR || 2025);
    const timezone = process.env.TZ || "Australia/Sydney";
    let data, source;
    if (ws) {
        try {
            data = await scrapeAll({ ws, clubSlug, seasonYear, timezone });
            source = "scrape";
        }
        catch (err) {
            console.error("scrape failed, falling back:", err);
            data = sampleData();
            source = "fallback";
        }
    }
    else {
        data = sampleData();
        source = "fallback";
    }
    CACHE = data;
    CACHE_AT = Date.now();
    return { data, source };
}
