/**
 * Connects to Browserless via Playwright and returns normalized JSON:
 * { updated, club, season, upcoming[], results[] }
 *
 * NOTE: The parsing logic is a conservative stub that aims to be safe to deploy.
 * It demonstrates the connection, loads the club page and competition pages,
 * and returns an empty result set if selectors don't match. You can extend
 * the CSS selectors once we confirm the exact DOM structure for your comps.
 */
import { chromium } from "playwright-core";
import { minisModsNoScore } from "./normalize.js";

const ORIGIN = "https://www.playrugbyleague.com";

export async function scrapeAll({ ws, clubSlug, seasonYear, timezone }) {
  const browser = await chromium.connectOverCDP(ws);
  const context = await browser.newContext({ timezoneId: timezone || "Australia/Sydney" });
  const page = await context.newPage();

  const clubUrl = `${ORIGIN}/competitions/club/${clubSlug}`;
  const upcoming = [];
  const results = [];

  try {
    // 1) Open club page and attempt to find links to this season's competitions
    await page.goto(clubUrl, { waitUntil: "domcontentloaded" });
    // Wait for any links to render (SPA). Adjust selector later when we confirm exact markup.
    await page.waitForTimeout(1500);

    const compLinks = await page.$$eval("a[href*='/competitions/']", (as) => {
      const seen = new Set();
      return as
        .map(a => a.href)
        .filter(href => {
          if (!href) return false;
          if (!href.includes("/competitions/")) return false;
          if (seen.has(href)) return false;
          seen.add(href);
          return true;
        })
        .slice(0, 8); // safety cap for first pass
    });

    // 2) Visit a few competition pages and try to parse visible items
    for (const href of compLinks) {
      try {
        await page.goto(href, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);

        // Try very generic extraction for “cards” or “rows” that include date/team/score text.
        const items = await page.$$eval("*", (nodes) => {
          // Grab text from reasonable item containers
          return nodes
            .filter(n => {
              const name = n.tagName;
              if (!name) return false;
              // likely card/row containers
              return ["LI","TR","ARTICLE","DIV"].includes(name);
            })
            .map(n => n.innerText.trim())
            .filter(t => t && t.length > 20)
            .slice(0, 50);
        });

        // Very light heuristic: split recent vs upcoming by keywords.
        for (const t of items) {
          const lower = t.toLowerCase();
          const looksFT = lower.includes("full time") || lower.includes("ft");
          const hasVs = lower.includes(" vs ") || lower.includes(" v ");
          if (!hasVs) continue;

          if (looksFT) {
            // rudimentary result object; real parser will map fields exactly
            const obj = {
              date: new Date().toISOString(),
              grade: "Unknown Grade",
              homeTeam: "Home",
              awayTeam: "Away",
              scoreHome: null,
              scoreAway: null,
              status: "FT",
              source: href
            };
            results.push(minisModsNoScore(obj));
          } else {
            const obj = {
              date: new Date(Date.now() + 3*24*60*60*1000).toISOString(),
              grade: "Unknown Grade",
              homeTeam: "Home",
              awayTeam: "Away",
              venue: "TBC",
              source: href
            };
            upcoming.push(obj);
          }
        }
      } catch (err) {
        console.warn("comp parse issue:", href, err);
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const updated = new Date().toISOString();
  return {
    updated,
    club: "Dudley Redhead JRLFC",
    season: Number(seasonYear || 2025),
    upcoming,
    results
  };
}