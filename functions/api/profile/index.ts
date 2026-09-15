const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{8,48}$/u;

type ProfileRow = {
  id: string;
  display_name: string | null;
  created_at: number;
  last_seen_at: number;
  rounds_recorded: number;
  replays_reviewed: number;
  faker_wins: number;
  spotter_wins: number;
  faker_rating: number;
  spotter_rating: number;
};

type ActiveReplayStatsRow = {
  active_runs: number;
  review_count: number | null;
  faker_wins: number | null;
  spotter_wins: number | null;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const profileId = normalizeProfileId(url.searchParams.get("profileId"));

  if (!profileId) {
    return jsonResponse({ error: "Profile id is not valid." }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const profile = await getOrCreateProfile(env.REPLAY_DB, profileId, now);
  const activeReplayStats = await getActiveReplayStats(env.REPLAY_DB, profileId, now);
  const replaysReviewed = numberOrZero(profile.replays_reviewed);
  const spotterWins = numberOrZero(profile.spotter_wins);
  const activeReviewCount = numberOrZero(activeReplayStats.review_count);
  const activeFakerWins = numberOrZero(activeReplayStats.faker_wins);

  return jsonResponse({
    profile: {
      id: profile.id,
      displayName: profile.display_name,
      createdAt: profile.created_at,
      lastSeenAt: now,
    },
    totals: {
      roundsRecorded: numberOrZero(profile.rounds_recorded),
      replaysReviewed,
      fakerWins: numberOrZero(profile.faker_wins),
      spotterWins,
      fakerRating: numberOrZero(profile.faker_rating),
      spotterRating: numberOrZero(profile.spotter_rating),
    },
    rates: {
      spotterAccuracy: replaysReviewed > 0 ? spotterWins / replaysReviewed : 0,
      activeFakerFooledRate: activeReviewCount > 0 ? activeFakerWins / activeReviewCount : 0,
    },
    activeRuns: {
      count: numberOrZero(activeReplayStats.active_runs),
      reviewCount: activeReviewCount,
      fakerWins: activeFakerWins,
      spotterWins: numberOrZero(activeReplayStats.spotter_wins),
    },
  });
};

async function getOrCreateProfile(database: D1Database, profileId: string, now: number): Promise<ProfileRow> {
  const row = await database
    .prepare(
      `SELECT
         id,
         display_name,
         created_at,
         last_seen_at,
         rounds_recorded,
         replays_reviewed,
         faker_wins,
         spotter_wins,
         faker_rating,
         spotter_rating
       FROM profiles
       WHERE id = ?`,
    )
    .bind(profileId)
    .first<ProfileRow>();

  if (row) {
    await database.prepare("UPDATE profiles SET last_seen_at = ? WHERE id = ?").bind(now, profileId).run();
    return row;
  }

  await database
    .prepare("INSERT INTO profiles (id, created_at, last_seen_at) VALUES (?, ?, ?)")
    .bind(profileId, now, now)
    .run();

  return {
    id: profileId,
    display_name: null,
    created_at: now,
    last_seen_at: now,
    rounds_recorded: 0,
    replays_reviewed: 0,
    faker_wins: 0,
    spotter_wins: 0,
    faker_rating: 1000,
    spotter_rating: 1000,
  };
}

async function getActiveReplayStats(
  database: D1Database,
  profileId: string,
  now: number,
): Promise<ActiveReplayStatsRow> {
  const row = await database
    .prepare(
      `SELECT
         COUNT(*) AS active_runs,
         COALESCE(SUM(review_count), 0) AS review_count,
         COALESCE(SUM(faker_wins), 0) AS faker_wins,
         COALESCE(SUM(spotter_wins), 0) AS spotter_wins
       FROM replays
       WHERE owner_profile_id = ?
         AND expires_at >= ?`,
    )
    .bind(profileId, now)
    .first<ActiveReplayStatsRow>();

  return row ?? {
    active_runs: 0,
    review_count: 0,
    faker_wins: 0,
    spotter_wins: 0,
  };
}

function normalizeProfileId(value: string | null): string | null {
  return value && PROFILE_ID_PATTERN.test(value) ? value : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
