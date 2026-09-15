const REPLAY_ID_LENGTH = 10;
const REPLAY_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const REPLAY_TOKEN_PREFIX = "gz.";
const MAX_REPLAY_TOKEN_LENGTH = 160_000;
const REPLAY_TTL_SECONDS = 60 * 60 * 24 * 30;
const REPLAY_ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/u;
const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{8,48}$/u;
const ACTOR_ID_PATTERN = /^actor-\d{1,2}$/u;
const MAX_DISPLAY_NAME_LENGTH = 32;

type ReplayRow = {
  id: string;
  token: string;
  expires_at: number;
  owner_profile_id: string | null;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const now = Math.floor(Date.now() / 1000);
  const url = new URL(request.url);
  const excludeId = normalizeOptionalReplayId(url.searchParams.get("exclude"));
  const viewerProfileId = normalizeOptionalProfileId(url.searchParams.get("viewer"));

  if (excludeId === false) {
    return jsonResponse({ error: "Excluded replay id is not valid." }, 400);
  }

  if (viewerProfileId === false) {
    return jsonResponse({ error: "Viewer profile id is not valid." }, 400);
  }

  if (viewerProfileId) {
    await touchProfile(env.REPLAY_DB, viewerProfileId, now);
  }

  const row =
    (await findQueuedReplay(env.REPLAY_DB, {
      now,
      excludeId,
      viewerProfileId,
      preferOtherOwners: true,
    })) ??
    (await findQueuedReplay(env.REPLAY_DB, {
      now,
      excludeId,
      viewerProfileId,
      preferOtherOwners: false,
    }));

  await deleteExpiredReplays(env.REPLAY_DB, now);

  if (!row) {
    return jsonResponse({ error: "No replays are ready yet." }, 404);
  }

  return jsonResponse({
    id: row.id,
    token: row.token,
    expiresAt: row.expires_at,
    ownerProfileId: row.owner_profile_id,
  });
};

async function findQueuedReplay(
  database: D1Database,
  options: {
    now: number;
    excludeId: string | null;
    viewerProfileId: string | null;
    preferOtherOwners: boolean;
  },
): Promise<ReplayRow | null> {
  const conditions = ["expires_at >= ?"];
  const bindings: Array<number | string> = [options.now];

  if (options.excludeId) {
    conditions.push("id != ?");
    bindings.push(options.excludeId);
  }

  if (options.viewerProfileId) {
    conditions.push(
      "NOT EXISTS (SELECT 1 FROM review_attempts WHERE review_attempts.replay_id = replays.id AND review_attempts.reviewer_profile_id = ?)",
    );
    bindings.push(options.viewerProfileId);

    if (options.preferOtherOwners) {
      conditions.push("(owner_profile_id IS NULL OR owner_profile_id != ?)");
      bindings.push(options.viewerProfileId);
    } else {
      conditions.push("owner_profile_id = ?");
      bindings.push(options.viewerProfileId);
    }
  }

  return database
    .prepare(
      `SELECT id, token, expires_at, owner_profile_id
       FROM replays
       WHERE ${conditions.join(" AND ")}
       ORDER BY RANDOM()
       LIMIT 1`,
    )
    .bind(...bindings)
    .first<ReplayRow>();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { token?: unknown; profileId?: unknown; displayName?: unknown; humanActorId?: unknown };

  try {
    body = (await request.json()) as {
      token?: unknown;
      profileId?: unknown;
      displayName?: unknown;
      humanActorId?: unknown;
    };
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

  const profileId = normalizeOptionalProfileId(body.profileId);
  if (profileId === false) {
    return jsonResponse({ error: "Profile id is not valid." }, 400);
  }

  const displayName = normalizeDisplayName(body.displayName);
  if (displayName === false) {
    return jsonResponse({ error: "Display name is not valid." }, 400);
  }

  const humanActorId = normalizeOptionalActorId(body.humanActorId);
  if (humanActorId === false) {
    return jsonResponse({ error: "Human actor id is not valid." }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + REPLAY_TTL_SECONDS;

  if (profileId) {
    await upsertProfileAfterRecording(env.REPLAY_DB, profileId, displayName, now);
  }

  const id = await insertReplayWithFreshId(env.REPLAY_DB, token, profileId, humanActorId, now, expiresAt);

  await deleteExpiredReplays(env.REPLAY_DB, now);

  return jsonResponse({ id, expiresAt, ownerProfileId: profileId }, 201);
};

async function insertReplayWithFreshId(
  database: D1Database,
  token: string,
  ownerProfileId: string | null,
  humanActorId: string | null,
  createdAt: number,
  expiresAt: number,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = createReplayId();

    try {
      await database
        .prepare(
          "INSERT INTO replays (id, token, created_at, expires_at, owner_profile_id, human_actor_id) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id, token, createdAt, expiresAt, ownerProfileId, humanActorId)
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

async function upsertProfileAfterRecording(
  database: D1Database,
  profileId: string,
  displayName: string | null,
  now: number,
): Promise<void> {
  await database
    .prepare(
      `INSERT INTO profiles (id, display_name, created_at, last_seen_at, rounds_recorded)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         display_name = COALESCE(excluded.display_name, profiles.display_name),
         last_seen_at = excluded.last_seen_at,
         rounds_recorded = profiles.rounds_recorded + 1`,
    )
    .bind(profileId, displayName, now, now)
    .run();
}

async function touchProfile(database: D1Database, profileId: string, now: number): Promise<void> {
  await database
    .prepare(
      `INSERT INTO profiles (id, created_at, last_seen_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    )
    .bind(profileId, now, now)
    .run();
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

function normalizeOptionalReplayId(value: string | null): string | false | null {
  if (value == null || value === "") {
    return null;
  }

  return REPLAY_ID_PATTERN.test(value) ? value : false;
}

function normalizeOptionalProfileId(value: unknown): string | false | null {
  if (value == null || value === "") {
    return null;
  }

  return typeof value === "string" && PROFILE_ID_PATTERN.test(value) ? value : false;
}

function normalizeDisplayName(value: unknown): string | false | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.length <= MAX_DISPLAY_NAME_LENGTH ? trimmed : false;
}

function normalizeOptionalActorId(value: unknown): string | false | null {
  if (value == null || value === "") {
    return null;
  }

  return typeof value === "string" && ACTOR_ID_PATTERN.test(value) ? value : false;
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
