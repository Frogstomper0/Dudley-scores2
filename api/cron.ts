import { refreshGamesJson } from "../lib/data";

export default async function handler(request: Request): Promise<Response> {
  try {
    const { data, source } = await refreshGamesJson();
    return new Response(JSON.stringify({ ok: true, source, updated: data.updated }, null, 2), {
      headers: { "content-type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "cron_failed", message: String(err) }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
}
