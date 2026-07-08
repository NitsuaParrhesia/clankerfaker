import { getLocalProfile } from "./profile";

const REVIEW_API_PATH = "/api/reviews";
const STORED_REPLAY_ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/u;
const ACTOR_ID_PATTERN = /^actor-\d{1,2}$/u;

export type ReviewSubmissionErrorReason = "self-review" | "unscoreable" | "expired" | "not-found" | "network" | "unknown";

export class ReviewSubmissionError extends Error {
  reason: ReviewSubmissionErrorReason;
  status: number | null;

  constructor(reason: ReviewSubmissionErrorReason, message: string, status: number | null = null) {
    super(message);
    this.name = "ReviewSubmissionError";
    this.reason = reason;
    this.status = status;
  }
}

export type ReviewAggregate = {
  reviewCount: number;
  fakerWins: number;
  spotterWins: number;
  fooledRate: number;
};

export type ReviewRating = {
  rated: boolean;
  fakerDelta: number;
  spotterDelta: number;
  fakerRating: number | null;
  spotterRating: number | null;
};

export type ReviewResult = {
  id: string;
  replayId: string;
  guessedActorId: string;
  humanActorId: string;
  correct: boolean;
  alreadySubmitted: boolean;
  createdAt: number;
  aggregate: ReviewAggregate;
  rating: ReviewRating;
};

export async function submitReviewGuess(options: {
  replayId: string;
  guessedActorId: string;
}): Promise<ReviewResult> {
  if (!STORED_REPLAY_ID_PATTERN.test(options.replayId) || !ACTOR_ID_PATTERN.test(options.guessedActorId)) {
    throw new Error("Review submission is not valid.");
  }

  const profile = getLocalProfile();
  let response: Response;

  try {
    response = await fetch(REVIEW_API_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        replayId: options.replayId,
        reviewerProfileId: profile.id,
        displayName: profile.displayName,
        guessedActorId: options.guessedActorId,
      }),
    });
  } catch {
    throw new ReviewSubmissionError("network", "Review scoring service could not be reached.");
  }

  if (!response.ok) {
    const message = await getReviewErrorMessage(response);
    throw new ReviewSubmissionError(getReviewErrorReason(response.status, message), message, response.status);
  }

  const payload = (await response.json()) as Partial<ReviewResult>;
  const aggregate = payload.aggregate;
  const rating = payload.rating;
  if (
    typeof payload.id !== "string" ||
    typeof payload.replayId !== "string" ||
    typeof payload.guessedActorId !== "string" ||
    typeof payload.humanActorId !== "string" ||
    typeof payload.correct !== "boolean" ||
    typeof payload.alreadySubmitted !== "boolean" ||
    typeof payload.createdAt !== "number" ||
    !isReviewAggregate(aggregate) ||
    !isReviewRating(rating)
  ) {
    throw new Error("Review response is not valid.");
  }

  return {
    id: payload.id,
    replayId: payload.replayId,
    guessedActorId: payload.guessedActorId,
    humanActorId: payload.humanActorId,
    correct: payload.correct,
    alreadySubmitted: payload.alreadySubmitted,
    createdAt: payload.createdAt,
    aggregate,
    rating,
  };
}

function getReviewErrorReason(status: number, message: string): ReviewSubmissionErrorReason {
  if (status === 403 && /own replay/i.test(message)) {
    return "self-review";
  }

  if (status === 404 && /replay not found/i.test(message)) {
    return "not-found";
  }

  if (status === 409) {
    return "unscoreable";
  }

  if (status === 410) {
    return "expired";
  }

  return "unknown";
}

async function getReviewErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error;
    }
  } catch {
    // Non-JSON error bodies are treated as generic save failures.
  }

  return "Review could not be saved.";
}

function isReviewAggregate(value: unknown): value is ReviewAggregate {
  if (!value || typeof value !== "object") {
    return false;
  }

  const aggregate = value as ReviewAggregate;
  return (
    isFiniteNumber(aggregate.reviewCount) &&
    isFiniteNumber(aggregate.fakerWins) &&
    isFiniteNumber(aggregate.spotterWins) &&
    isFiniteNumber(aggregate.fooledRate)
  );
}

function isReviewRating(value: unknown): value is ReviewRating {
  if (!value || typeof value !== "object") {
    return false;
  }

  const rating = value as ReviewRating;
  return (
    typeof rating.rated === "boolean" &&
    isFiniteNumber(rating.fakerDelta) &&
    isFiniteNumber(rating.spotterDelta) &&
    (isFiniteNumber(rating.fakerRating) || rating.fakerRating == null) &&
    (isFiniteNumber(rating.spotterRating) || rating.spotterRating == null)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
