/**
 * Helpers for Minis/Mods and general shaping
 */
export function isMinisModsGrade(grade) {
    if (!grade)
        return false;
    const g = String(grade).toLowerCase();
    // U6-U12 or mentions of 'mini'/'mod'
    return /\bu([6-9]|1[0-2])\b/.test(g) || g.includes("mini") || g.includes("mod");
}
export function minisModsNoScore(game) {
    const out = { ...game };
    if (isMinisModsGrade(out.grade)) {
        out.scoreHome = null;
        out.scoreAway = null;
    }
    return out;
}
