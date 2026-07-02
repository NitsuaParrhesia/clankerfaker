type Env = {
  REPLAY_DB: D1Database;
};

type ReplayRow = {
  token: string;
  expires_at: number;
};

const REPLAY_ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/u;

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  if (typeof id !== "string" || !REPLAY_ID_PATTERN.test(id)) {
    return jsonResponse({ error: "Replay id is not valid." }, 400);
  }

  const row = await env.REPLAY_DB.prepare("SELECT token, expires_at FROM replays WHERE id = ?")
    .bind(id)
    .first<ReplayRow>();

  if (!row) {
    return jsonResponse({ error: "Replay not found." }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at < now) {
    await env.REPLAY_DB.prepare("DELETE FROM replays WHERE id = ?").bind(id).run();
    return jsonResponse({ error: "Replay expired." }, 410);
  }

  return jsonResponse({ token: row.token, expiresAt: row.expires_at });
};

function jsonResponse(payload: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
