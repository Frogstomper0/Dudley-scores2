import { getGamesJson } from "../lib/data";

export default async function handler(request: Request): Promise<Response> {
  try {
    const data = await getGamesJson({ preferFresh: false });
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "content-type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "games_failed", message: String(err) }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
}
