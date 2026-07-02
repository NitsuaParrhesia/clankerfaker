type Env = {
  REPLAY_DB: D1Database;
};

const REPLAY_ID_LENGTH = 10;
const REPLAY_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const REPLAY_TOKEN_PREFIX = "gz.";
const MAX_REPLAY_TOKEN_LENGTH = 160_000;
const REPLAY_TTL_SECONDS = 60 * 60 * 24 * 30;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { token?: unknown };

  try {
    body = (await request.json()) as { token?: unknown };
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const token = body.token;
  if (typeof token !== "string" || !token.startsWith(REPLAY_TOKEN_PREFIX)) {
    return jsonResponse({ error: "Replay token is not valid." }, 400);
  }

  if (token.length > MAX_REPLAY_TOKEN_LENGTH) {
    return jsonResponse({ error: "Replay token is too large." }, 413);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + REPLAY_TTL_SECONDS;
  const id = await insertReplayWithFreshId(env.REPLAY_DB, token, now, expiresAt);

  await deleteExpiredReplays(env.REPLAY_DB, now);

  return jsonResponse({ id, expiresAt }, 201);
};

async function insertReplayWithFreshId(
  database: D1Database,
  token: string,
  createdAt: number,
  expiresAt: number,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = createReplayId();

    try {
      await database
        .prepare("INSERT INTO replays (id, token, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .bind(id, token, createdAt, expiresAt)
        .run();
      return id;
    } catch (error) {
      if (attempt === 4 || !isLikelyConstraintError(error)) {
        throw error;
      }
    }
  }

  throw new Error("Could not create a replay id.");
}

async function deleteExpiredReplays(database: D1Database, now: number): Promise<void> {
  try {
    await database
      .prepare(
        "DELETE FROM replays WHERE id IN (SELECT id FROM replays WHERE expires_at < ? ORDER BY expires_at LIMIT 25)",
      )
      .bind(now)
      .run();
  } catch {
    // Cleanup should never block a successful share link.
  }
}

function createReplayId(): string {
  const bytes = new Uint8Array(REPLAY_ID_LENGTH);
  crypto.getRandomValues(bytes);

  let id = "";
  for (const byte of bytes) {
    id += REPLAY_ID_ALPHABET[byte % REPLAY_ID_ALPHABET.length];
  }

  return id;
}

function isLikelyConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique|primary/i.test(error.message);
}

function jsonResponse(payload: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
