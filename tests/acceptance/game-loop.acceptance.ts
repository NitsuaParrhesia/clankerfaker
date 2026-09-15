import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, expect, it, vi } from "vitest";
import { getLocalProfile } from "../../src/game/profile";
import { loadLocalProfileStats } from "../../src/game/profileStats";
import { createReplayShare, decodeReplayShare, loadPooledReplay } from "../../src/game/shareLink";
import { submitReviewGuess } from "../../src/game/reviews";
import { playWinningRound } from "./winning-recording";

const baseUrl = process.env.ACCEPTANCE_BASE_URL;
if (baseUrl !== "http://127.0.0.1:8789") {
  throw new Error("Run node scripts/acceptance.mjs. Acceptance writes are restricted to its isolated localhost server.");
}
const realFetch = globalThis.fetch;
const storage = new Map<string, string>();
vi.stubGlobal("window", {
  location: { href: baseUrl },
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  },
});
vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : input, baseUrl);
  if (url.origin !== baseUrl) throw new Error(`Refusing a non-local acceptance request: ${url.origin}`);
  return realFetch(url, init);
});
afterAll(() => vi.unstubAllGlobals());

function newProfile() {
  storage.clear();
  return getLocalProfile();
}

async function leaderboard() {
  const response = await fetch("/api/leaderboard?limit=10");
  expect(response.ok).toBe(true);
  return response.json();
}

it("completes a faker run, shares it, scores another profile once, and leaves self-reviews unranked", async () => {
  const recording = playWinningRound();
  expect(recording.outcome.humanWon).toBe(true);
  expect(recording.duration).toBeCloseTo(35, 1);
  expect(recording.snapshots.at(-1)?.completedTaskIds).toHaveLength(recording.task.required);
  expect(recording.snapshots).toHaveLength(352);
  const owner = newProfile();
  const share = await createReplayShare(recording, baseUrl);
  expect(share.stored).toBe(true);
  expect(share.id).toMatch(/^[A-Za-z0-9_-]{10}$/u);
  const outputDirectory = resolve(".wrangler/acceptance");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, "replay-fixture.json"), JSON.stringify({
    share, owner, humanActorId: recording.humanActorId, recording,
  }));
  const ownerBefore = await loadLocalProfileStats();
  expect(ownerBefore.totals).toMatchObject({ roundsRecorded: 1, fakerRating: 1000, spotterRating: 1000 });

  const reviewer = newProfile();
  expect(reviewer.id).not.toBe(owner.id);
  const queued = await loadPooledReplay();
  expect(queued.id).toBe(share.id);
  expect(queued.ownerProfileId).toBe(owner.id);
  const decoded = await decodeReplayShare(share.url);
  expect(decoded?.recording.outcome).toEqual({ ...recording.outcome, duration: expect.any(Number) });
  expect(decoded!.recording.outcome.duration).toBeCloseTo(recording.outcome.duration, 2);
  expect(decoded?.recording.snapshots).toHaveLength(recording.snapshots.length);
  expect(new Set(decoded?.recording.snapshots.at(-1)?.completedTaskIds))
    .toEqual(new Set(recording.snapshots.at(-1)?.completedTaskIds));
  const botId = recording.snapshots[0].actors.find((actor) => actor.id !== recording.humanActorId)!.id;
  const correct = await submitReviewGuess({ replayId: share.id!, guessedActorId: recording.humanActorId });
  expect(correct).toMatchObject({ correct: true, alreadySubmitted: false, selfReview: false,
    aggregate: { reviewCount: 1, fakerWins: 0, spotterWins: 1 },
    rating: { rated: true, fakerDelta: -12, spotterDelta: 12, fakerRating: 988, spotterRating: 1012 },
  });
  const reviewerAfter = await loadLocalProfileStats();
  expect(reviewerAfter.totals).toMatchObject({ replaysReviewed: 1, spotterWins: 1, spotterRating: 1012 });
  const boardAfter = await leaderboard();
  expect(boardAfter.fakers).toContainEqual(expect.objectContaining({ profileId: owner.id, rating: 988, games: 1 }));
  expect(boardAfter.spotters).toContainEqual(expect.objectContaining({ profileId: reviewer.id, rating: 1012, wins: 1, games: 1 }));

  const duplicate = await submitReviewGuess({ replayId: share.id!, guessedActorId: botId });
  expect(duplicate).toMatchObject({ id: correct.id, correct: true, alreadySubmitted: true,
    guessedActorId: recording.humanActorId, aggregate: correct.aggregate,
    rating: { rated: true, fakerDelta: 0, spotterDelta: 0, fakerRating: 988, spotterRating: 1012 },
  });
  expect((await loadLocalProfileStats()).totals).toEqual(reviewerAfter.totals);
  expect((await leaderboard()).spotters).toEqual(boardAfter.spotters);
  await expect(loadPooledReplay()).rejects.toThrow("No queued replays are ready yet.");

  storage.set("clanker-faker-profile-v1", JSON.stringify(owner));
  const ownerRated = await loadLocalProfileStats();
  const selfReview = await submitReviewGuess({ replayId: share.id!, guessedActorId: botId });
  expect(selfReview).toMatchObject({ correct: false, alreadySubmitted: false, selfReview: true,
    aggregate: correct.aggregate,
    rating: { rated: false, fakerDelta: 0, spotterDelta: 0 },
  });
  expect((await loadLocalProfileStats()).totals).toEqual(ownerRated.totals);
  expect((await loadLocalProfileStats()).activeRuns).toEqual(ownerRated.activeRuns);
  const selfDuplicate = await submitReviewGuess({ replayId: share.id!, guessedActorId: recording.humanActorId });
  expect(selfDuplicate).toMatchObject({ id: selfReview.id, alreadySubmitted: true, correct: false, selfReview: true,
    aggregate: correct.aggregate, rating: { rated: false, fakerDelta: 0, spotterDelta: 0 },
  });
  const boardFinal = await leaderboard();
  expect(boardFinal.fakers).toEqual(boardAfter.fakers);
  expect(boardFinal.spotters).toEqual(boardAfter.spotters);
  await expect(loadPooledReplay()).rejects.toThrow("No queued replays are ready yet.");

  const fixture = { share, owner, reviewer, humanActorId: recording.humanActorId, recording };
  await writeFile(resolve(outputDirectory, "replay-fixture.json"), JSON.stringify(fixture));
  await writeFile(resolve(outputDirectory, "report.json"), JSON.stringify({
    checkedAt: new Date().toISOString(), baseUrl, replayUrl: share.url,
    duration: recording.duration, snapshots: recording.snapshots.length,
    ownerRating: 988, reviewerRating: 1012,
    checks: ["real simulation victory", "gzip store and decode", "distinct reviewer queue", "ratings and leaderboard",
      "duplicate review idempotency", "self-review remains unranked", "reviewed replay excluded from queue"],
  }, null, 2));
  console.log(`Replay fixture: ${share.url}`);
});

it("scores a first-visit reviewer opening a shared link without an existing server profile", async () => {
  const recording = playWinningRound();
  const owner = newProfile();
  const share = await createReplayShare(recording, baseUrl);
  expect(share.stored).toBe(true);
  const reviewer = newProfile();
  const decoded = await decodeReplayShare(share.url);
  expect(decoded?.recording.humanActorId).toBe(recording.humanActorId);
  const guessedActorId = recording.snapshots[0].actors.find((actor) => actor.id !== recording.humanActorId)!.id;
  const result = await submitReviewGuess({ replayId: share.id!, guessedActorId });
  expect(result).toMatchObject({ correct: false, alreadySubmitted: false,
    aggregate: { reviewCount: 1, fakerWins: 1, spotterWins: 0 },
    rating: { rated: true, fakerDelta: 12, spotterDelta: -12, fakerRating: 1012, spotterRating: 988 },
  });
  expect((await loadLocalProfileStats()).totals).toMatchObject({ replaysReviewed: 1, spotterWins: 0, spotterRating: 988 });
  storage.set("clanker-faker-profile-v1", JSON.stringify(owner));
  expect((await loadLocalProfileStats()).totals).toMatchObject({ fakerWins: 1, fakerRating: 1012 });
  expect((await leaderboard()).spotters).toContainEqual(expect.objectContaining({ profileId: reviewer.id, rating: 988, games: 1 }));
});
