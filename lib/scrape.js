// lib/scrape.ts
// @ts-nocheck
/**
 * Connects to Browserless via Playwright and returns normalized JSON:
 * { updated, club, season, upcoming[], results[] }
 *
 * Conservative parser:
 * - Loads club page, discovers competition links.
 * - Visits a handful of competition pages.
 * - Pulls text from likely "cards/rows" and heuristically extracts teams/scores/dates.
 * - Minis/Mods (U6–U12) scores are omitted via minisModsNoScore().
 * - Always closes browser/context; continues on per-page failures.
 */
import { scrapeAll } from "../lib/scrape";
import { chromium } from "playwright-core";
import { minisModsNoScore } from "./normalize";
const ORIGIN = "https://www.playrugbyleague.com";
// --- tiny helpers -----------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function unique(arr) {
    const seen = new Set();
    const out = [];
    for (const item of arr) {
        const key = typeof item === "string" ? item : JSON.stringify(item);
        if (!seen.has(key)) {
            seen.add(key);
            out.push(item);
        }
    }
    return out;
}
function parseTeams(text) {
    // Match: "Dudley Redhead v South Newcastle" / "Dudley Redhead vs South Newcastle"
    const m = text.match(/([\p{L}\p{N}&.'()\- ]{2,}?)\s+(?:vs|v)\s+([\p{L}\p{N}&.'()\- ]{2,})/iu);
    if (!m)
        return null;
    return { homeTeam: m[1].trim(), awayTeam: m[2].trim() };
}
function parseScorePair(text) {
    // Match common score patterns like "12 - 18" or "12–18"
    const m = text.match(/\b(\d{1,3})\s*[-–]\s*(\d{1,3})\b/);
    if (!m)
        return null;
    return { scoreHome: Number(m[1]), scoreAway: Number(m[2]) };
}
function looksFullTime(text) {
    const t = text.toLowerCase();
    return t.includes("full time") || t.includes("ft") || /\bft\b/i.test(text);
}
function normalizeIso(dateLike) {
    try {
        if (!dateLike)
            return new Date().toISOString();
        if (typeof dateLike === "string") {
            // Basic parse for formats like "Sat 10 Aug", "10/08/2025", etc.
            // If parsing fails, default to now.
            const parsed = Date.parse(dateLike);
            if (!Number.isNaN(parsed))
                return new Date(parsed).toISOString();
        }
        else if (dateLike instanceof Date && !Number.isNaN(dateLike.valueOf())) {
            return dateLike.toISOString();
        }
    }
    catch { }
    return new Date().toISOString();
}
function inferDateNearby(text) {
    // Try pull something date-like from the text; if not found, return undefined
    // e.g., "Sat 10 Aug 10:00 AM", "10/08/2025", "Aug 10"
    const m = text.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/) || // 10/08[/2025]
        text.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.*?\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b.*?\d{1,2}/i) ||
        text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b\.?\s+\d{1,2}(?:,\s*\d{4})?/i);
    return m ? m[0] : undefined;
}
function isMinisModsGradeGuess(text) {
    // Helps us mark scores as null if the grade indicates Minis/Mods U6–U12
    return /\bu(?:6|7|8|9|10|11|12)\b/i.test(text) || /mini|mod/i.test(text);
}
// --- main scrape ------------------------------------------------------------
export async function scrapeAll({ ws, clubSlug, seasonYear, timezone, }) {
    // 1) Connect to the remote Chromium the recommended way (CDP).
    //    Browserless documents this flow and Playwright exposes connectOverCDP.
    //    (Refs: Playwright BrowserType.connectOverCDP; Browserless Playwright connect docs)
    const browser = await chromium.connectOverCDP(ws);
    const context = await browser.newContext({
        timezoneId: timezone || "Australia/Sydney",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        // Keep it light; we don't need storage/state.
    });
    const page = await context.newPage();
    const clubUrl = `${ORIGIN}/competitions/club/${clubSlug}`;
    const upcoming = [];
    const results = [];
    try {
        // 2) Open club page; let SPA render
        await page.goto(clubUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await sleep(1500);
        // 3) Discover a handful of competition links (unique, same-origin)
        const compLinks = await page.$$eval("a[href*='/competitions/']", (as) => {
            const out = [];
            const seen = new Set();
            for (const a of as) {
                if (!(a instanceof HTMLAnchorElement))
                    continue;
                const href = a.href;
                if (!href)
                    continue;
                if (!href.includes("/competitions/"))
                    continue;
                if (!href.startsWith("http"))
                    continue;
                if (seen.has(href))
                    continue;
                seen.add(href);
                out.push(href);
                if (out.length >= 10)
                    break; // safety cap
            }
            return out;
        });
        // 4) Visit each competition page and extract fixtures/results heuristically
        for (const href of unique(compLinks)) {
            try {
                await page.goto(href, { waitUntil: "domcontentloaded", timeout: 45_000 });
                await sleep(1500);
                // Prefer big list-ish containers (LI/TR/ARTICLE/DIV)
                const items = await page.$$eval("*", (nodes) => {
                    const buf = [];
                    for (const n of nodes) {
                        const name = n.tagName;
                        if (!name)
                            continue;
                        if (!["LI", "TR", "ARTICLE", "DIV"].includes(name))
                            continue;
                        const t = (n.textContent || "").replace(/\s+/g, " ").trim();
                        if (t && t.length > 25)
                            buf.push(t);
                        if (buf.length >= 120)
                            break; // safety cap
                    }
                    return buf;
                });
                // Optional match-centre links (deep links) – handy for source attribution
                const matchLinks = await page.$$eval("a[href*='/match-centre/']", (as) => Array.from(as)
                    .filter((a) => a instanceof HTMLAnchorElement)
                    .map((a) => a.href)
                    .slice(0, 100));
                // Extract a grade hint from the page (e.g., a heading)
                const gradeHint = (await page.title()).replace(/\s*\|\s*Play Rugby League.*/i, "").trim() ||
                    (await page.locator("h1,h2").first().textContent().catch(() => "")) ||
                    "Unknown Grade";
                for (const raw of items) {
                    const text = raw.trim();
                    const teams = parseTeams(text);
                    if (!teams)
                        continue;
                    const hasScore = parseScorePair(text);
                    const ft = looksFullTime(text);
                    const dateGuess = inferDateNearby(text);
                    const iso = normalizeIso(dateGuess);
                    if (ft || hasScore) {
                        // Completed result
                        const base = {
                            date: iso,
                            grade: gradeHint,
                            homeTeam: teams.homeTeam,
                            awayTeam: teams.awayTeam,
                            status: ft ? "FT" : "Result",
                            source: href,
                            matchUrl: matchLinks.find((m) => text.includes(m.split("/").pop() || "")) || href,
                        };
                        let obj = { ...base, scoreHome: null, scoreAway: null };
                        if (hasScore)
                            obj = { ...obj, ...hasScore };
                        // Ensure Minis/Mods scores are omitted
                        const finalObj = isMinisModsGradeGuess(base.grade)
                            ? minisModsNoScore({ ...obj, grade: base.grade })
                            : obj;
                        results.push(finalObj);
                    }
                    else {
                        // Upcoming fixture
                        const fixture = {
                            date: iso || normalizeIso(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)),
                            grade: gradeHint,
                            homeTeam: teams.homeTeam,
                            awayTeam: teams.awayTeam,
                            venue: /field|oval|park|ground|stadium/i.test(text) ? text : "TBC",
                            source: href,
                        };
                        upcoming.push(fixture);
                    }
                }
            }
            catch (err) {
                console.warn("competition parse issue:", href, String(err));
            }
        }
    }
    finally {
        try {
            await context.close();
        }
        catch { }
        try {
            await browser.close();
        }
        catch { }
    }
    const updated = new Date().toISOString();
    return {
        updated,
        club: "Dudley Redhead JRLFC",
        season: Number(seasonYear || 2025),
        upcoming: unique(upcoming).slice(0, 200),
        results: unique(results).slice(0, 200),
    };
}
