type Env = {
  REPLAY_DB: D1Database;
};

const REVIEW_ID_LENGTH = 12;
const REVIEW_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const REPLAY_ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/u;
const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{8,48}$/u;
const ACTOR_ID_PATTERN = /^actor-\d{1,2}$/u;
const MAX_DISPLAY_NAME_LENGTH = 32;
const BASE_RATING = 1000;
const MIN_RATING = 100;
const RATING_K_FACTOR = 24;

type ReplayRow = {
  id: string;
  owner_profile_id: string | null;
  human_actor_id: string | null;
  expires_at: number;
};

type ReviewAttemptRow = {
  id: string;
  guessed_actor_id: string;
  human_actor_id: string;
  correct: number;
  created_at: number;
};

type ReplayAggregateRow = {
  review_count: number | null;
  faker_wins: number | null;
  spotter_wins: number | null;
};

type ReplayAggregate = {
  reviewCount: number;
  fakerWins: number;
  spotterWins: number;
  fooledRate: number;
};

type ProfileRatingRow = {
  faker_rating: number | null;
  spotter_rating: number | null;
};

type ReviewRating = {
  rated: boolean;
  fakerDelta: number;
  spotterDelta: number;
  fakerRating: number | null;
  spotterRating: number | null;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: {
    replayId?: unknown;
    reviewerProfileId?: unknown;
    displayName?: unknown;
    guessedActorId?: unknown;
  };

  try {
    body = (await request.json()) as {
      replayId?: unknown;
      reviewerProfileId?: unknown;
      displayName?: unknown;
      guessedActorId?: unknown;
    };
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const replayId = normalizeReplayId(body.replayId);
  const reviewerProfileId = normalizeProfileId(body.reviewerProfileId);
  const guessedActorId = normalizeActorId(body.guessedActorId);
  const displayName = normalizeDisplayName(body.displayName);

  if (!replayId) {
    return jsonResponse({ error: "Replay id is not valid." }, 400);
  }

  if (!reviewerProfileId) {
    return jsonResponse({ error: "Reviewer profile id is not valid." }, 400);
  }

  if (!guessedActorId) {
    return jsonResponse({ error: "Guessed actor id is not valid." }, 400);
  }

  if (displayName === false) {
    return jsonResponse({ error: "Display name is not valid." }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const replay = await env.REPLAY_DB.prepare(
    "SELECT id, owner_profile_id, human_actor_id, expires_at FROM replays WHERE id = ?",
  )
    .bind(replayId)
    .first<ReplayRow>();

  if (!replay) {
    return jsonResponse({ error: "Replay not found." }, 404);
  }

  if (replay.expires_at < now) {
    await env.REPLAY_DB.prepare("DELETE FROM replays WHERE id = ?").bind(replayId).run();
    return jsonResponse({ error: "Replay expired." }, 410);
  }

  if (!replay.human_actor_id) {
    return jsonResponse({ error: "Replay cannot be scored." }, 409);
  }

  const existing = await getExistingAttempt(env.REPLAY_DB, replayId, reviewerProfileId);
  if (existing) {
    const aggregate = await getReplayAggregate(env.REPLAY_DB, replayId);
    const rating = await getCurrentReviewRating(env.REPLAY_DB, replay.owner_profile_id, reviewerProfileId);

    return jsonResponse({
      id: existing.id,
      replayId,
      guessedActorId: existing.guessed_actor_id,
      humanActorId: existing.human_actor_id,
      correct: existing.correct === 1,
      alreadySubmitted: true,
      createdAt: existing.created_at,
      aggregate,
      rating,
    });
  }

  const correct = guessedActorId === replay.human_actor_id;
  const selfReview = replay.owner_profile_id === reviewerProfileId;
  let reviewResult: InsertReviewResult;

  try {
    reviewResult = await insertReviewWithFreshId(env.REPLAY_DB, {
      replayId,
      ownerProfileId: replay.owner_profile_id,
      reviewerProfileId,
      guessedActorId,
      humanActorId: replay.human_actor_id,
      correct,
      selfReview,
      displayName: displayName || null,
      now,
    });
  } catch (error) {
    if (!isLikelyConstraintError(error)) {
      throw error;
    }

    const duplicate = await getExistingAttempt(env.REPLAY_DB, replayId, reviewerProfileId);
    if (!duplicate) {
      throw error;
    }

    const aggregate = await getReplayAggregate(env.REPLAY_DB, replayId);
    const rating = await getCurrentReviewRating(env.REPLAY_DB, replay.owner_profile_id, reviewerProfileId);

    return jsonResponse({
      id: duplicate.id,
      replayId,
      guessedActorId: duplicate.guessed_actor_id,
      humanActorId: duplicate.human_actor_id,
      correct: duplicate.correct === 1,
      alreadySubmitted: true,
      createdAt: duplicate.created_at,
      aggregate,
      rating,
    });
  }

  const aggregate = await getReplayAggregate(env.REPLAY_DB, replayId);

  return jsonResponse(
    {
      id: reviewResult.id,
      replayId,
      guessedActorId,
      humanActorId: replay.human_actor_id,
      correct,
      alreadySubmitted: false,
      createdAt: now,
      aggregate,
      rating: reviewResult.rating,
    },
    201,
  );
};

async function getExistingAttempt(
  database: D1Database,
  replayId: string,
  reviewerProfileId: string,
): Promise<ReviewAttemptRow | null> {
  return database
    .prepare(
      "SELECT id, guessed_actor_id, human_actor_id, correct, created_at FROM review_attempts WHERE replay_id = ? AND reviewer_profile_id = ?",
    )
    .bind(replayId, reviewerProfileId)
    .first<ReviewAttemptRow>();
}

async function getReplayAggregate(database: D1Database, replayId: string): Promise<ReplayAggregate> {
  const row = await database
    .prepare("SELECT review_count, faker_wins, spotter_wins FROM replays WHERE id = ?")
    .bind(replayId)
    .first<ReplayAggregateRow>();

  return buildReplayAggregate(row);
}

function buildReplayAggregate(row: ReplayAggregateRow | null): ReplayAggregate {
  const reviewCount = numberOrZero(row?.review_count);
  const fakerWins = numberOrZero(row?.faker_wins);
  const spotterWins = numberOrZero(row?.spotter_wins);

  return {
    reviewCount,
    fakerWins,
    spotterWins,
    fooledRate: reviewCount > 0 ? fakerWins / reviewCount : 0,
  };
}

async function getCurrentReviewRating(
  database: D1Database,
  ownerProfileId: string | null,
  reviewerProfileId: string,
): Promise<ReviewRating> {
  if (!ownerProfileId) {
    return createUnratedReviewRating();
  }

  const [ownerRating, reviewerRating] = await Promise.all([
    getProfileRating(database, ownerProfileId),
    getProfileRating(database, reviewerProfileId),
  ]);

  if (!ownerRating) {
    return createUnratedReviewRating();
  }

  return {
    rated: true,
    fakerDelta: 0,
    spotterDelta: 0,
    fakerRating: numberOrDefault(ownerRating?.faker_rating, BASE_RATING),
    spotterRating: numberOrDefault(reviewerRating?.spotter_rating, BASE_RATING),
  };
}

async function getRatingAdjustment(
  database: D1Database,
  ownerProfileId: string | null,
  reviewerProfileId: string,
  correct: boolean,
): Promise<ReviewRating> {
  if (!ownerProfileId) {
    return createUnratedReviewRating();
  }

  const [ownerRating, reviewerRating] = await Promise.all([
    getProfileRating(database, ownerProfileId),
    getProfileRating(database, reviewerProfileId),
  ]);

  if (!ownerRating) {
    return createUnratedReviewRating();
  }

  const fakerRating = numberOrDefault(ownerRating?.faker_rating, BASE_RATING);
  const spotterRating = numberOrDefault(reviewerRating?.spotter_rating, BASE_RATING);
  const spotterScore = correct ? 1 : 0;
  const expectedSpotterScore = getExpectedRatingScore(spotterRating, fakerRating);
  const spotterDelta = Math.round(RATING_K_FACTOR * (spotterScore - expectedSpotterScore));
  const fakerDelta = -spotterDelta;

  return {
    rated: true,
    fakerDelta,
    spotterDelta,
    fakerRating: clampRating(fakerRating + fakerDelta),
    spotterRating: clampRating(spotterRating + spotterDelta),
  };
}

async function getProfileRating(database: D1Database, profileId: string): Promise<ProfileRatingRow | null> {
  return database
    .prepare("SELECT faker_rating, spotter_rating FROM profiles WHERE id = ?")
    .bind(profileId)
    .first<ProfileRatingRow>();
}

type InsertReviewResult = {
  id: string;
  rating: ReviewRating;
};

async function insertReviewWithFreshId(
  database: D1Database,
  options: {
    replayId: string;
    ownerProfileId: string | null;
    reviewerProfileId: string;
    guessedActorId: string;
    humanActorId: string;
    correct: boolean;
    selfReview: boolean;
    displayName: string | null;
    now: number;
  },
): Promise<InsertReviewResult> {
  const rating = await getRatingAdjustment(database, options.ownerProfileId, options.reviewerProfileId, options.correct);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = createReviewId();
    const spotterWin = options.correct ? 1 : 0;
    const fakerWin = options.correct ? 0 : 1;

    try {
      const statements = [
        database
          .prepare(
            `INSERT INTO review_attempts (
              id,
              replay_id,
              owner_profile_id,
              reviewer_profile_id,
              guessed_actor_id,
              human_actor_id,
              correct,
              self_review,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            options.replayId,
            options.ownerProfileId,
            options.reviewerProfileId,
            options.guessedActorId,
            options.humanActorId,
            spotterWin,
            options.selfReview ? 1 : 0,
            options.now,
          ),
        database
          .prepare(
            `INSERT INTO profiles (
              id,
              display_name,
              created_at,
              last_seen_at,
              replays_reviewed,
              spotter_wins,
              spotter_rating
            ) VALUES (?, ?, ?, ?, 1, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               display_name = COALESCE(excluded.display_name, profiles.display_name),
               last_seen_at = excluded.last_seen_at,
               replays_reviewed = profiles.replays_reviewed + 1,
               spotter_wins = profiles.spotter_wins + excluded.spotter_wins,
               spotter_rating = MAX(?, profiles.spotter_rating + ?)`,
          )
          .bind(
            options.reviewerProfileId,
            options.displayName,
            options.now,
            options.now,
            spotterWin,
            rating.spotterRating ?? BASE_RATING,
            MIN_RATING,
            rating.spotterDelta,
          ),
        database
          .prepare(
            `UPDATE replays
             SET review_count = review_count + 1,
                 spotter_wins = spotter_wins + ?,
                 faker_wins = faker_wins + ?
             WHERE id = ?`,
          )
          .bind(spotterWin, fakerWin, options.replayId),
      ];

      if (options.ownerProfileId) {
        statements.push(
          database
            .prepare(
              `UPDATE profiles
               SET faker_wins = faker_wins + ?,
                   faker_rating = MAX(?, faker_rating + ?)
               WHERE id = ?`,
            )
            .bind(fakerWin, MIN_RATING, rating.fakerDelta, options.ownerProfileId),
        );
      }

      await database.batch(statements);
      return { id, rating };
    } catch (error) {
      if (attempt === 4 || !isLikelyConstraintError(error)) {
        throw error;
      }
    }
  }

  throw new Error("Could not create a review id.");
}

function createReviewId(): string {
  const bytes = new Uint8Array(REVIEW_ID_LENGTH);
  crypto.getRandomValues(bytes);

  let id = "";
  for (const byte of bytes) {
    id += REVIEW_ID_ALPHABET[byte % REVIEW_ID_ALPHABET.length];
  }

  return id;
}

function isLikelyConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique|primary/i.test(error.message);
}

function normalizeReplayId(value: unknown): string | null {
  return typeof value === "string" && REPLAY_ID_PATTERN.test(value) ? value : null;
}

function normalizeProfileId(value: unknown): string | null {
  return typeof value === "string" && PROFILE_ID_PATTERN.test(value) ? value : null;
}

function normalizeActorId(value: unknown): string | null {
  return typeof value === "string" && ACTOR_ID_PATTERN.test(value) ? value : null;
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

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getExpectedRatingScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

function clampRating(rating: number): number {
  return Math.max(MIN_RATING, rating);
}

function createUnratedReviewRating(): ReviewRating {
  return {
    rated: false,
    fakerDelta: 0,
    spotterDelta: 0,
    fakerRating: null,
    spotterRating: null,
  };
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
