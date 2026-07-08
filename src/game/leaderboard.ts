import { createDefaultDisplayName, resolveGeneratedProfileDisplayName } from "./profile";

const LEADERBOARD_API_PATH = "/api/leaderboard";
const DEFAULT_LEADERBOARD_LIMIT = 5;
const MAX_LEADERBOARD_LIMIT = 10;

export type LeaderboardEntry = {
  profileId: string;
  displayName: string;
  rank: number;
  rating: number;
  wins: number;
  games: number;
};

export type Leaderboard = {
  generatedAt: number;
  fakers: LeaderboardEntry[];
  spotters: LeaderboardEntry[];
};

type SeededLeaderboardEntry = Omit<LeaderboardEntry, "displayName" | "rank">;

const SEEDED_FAKER_ENTRIES: SeededLeaderboardEntry[] = [
  { profileId: "cf_seeded_clanker_01", rating: 1132, wins: 18, games: 25 },
  { profileId: "cf_seeded_clanker_02", rating: 1108, wins: 15, games: 22 },
  { profileId: "cf_seeded_clanker_03", rating: 1086, wins: 13, games: 20 },
  { profileId: "cf_seeded_clanker_04", rating: 1069, wins: 11, games: 18 },
  { profileId: "cf_seeded_clanker_05", rating: 1051, wins: 10, games: 17 },
  { profileId: "cf_seeded_clanker_06", rating: 1033, wins: 8, games: 15 },
  { profileId: "cf_seeded_clanker_07", rating: 1019, wins: 7, games: 14 },
  { profileId: "cf_seeded_clanker_08", rating: 1007, wins: 6, games: 12 },
  { profileId: "cf_seeded_clanker_09", rating: 994, wins: 5, games: 11 },
  { profileId: "cf_seeded_clanker_13", rating: 981, wins: 4, games: 9 },
];

const SEEDED_SPOTTER_ENTRIES: SeededLeaderboardEntry[] = [
  { profileId: "cf_seeded_spotter_01", rating: 1120, wins: 17, games: 24 },
  { profileId: "cf_seeded_spotter_02", rating: 1097, wins: 14, games: 21 },
  { profileId: "cf_seeded_spotter_03", rating: 1078, wins: 12, games: 19 },
  { profileId: "cf_seeded_spotter_04", rating: 1059, wins: 11, games: 17 },
  { profileId: "cf_seeded_spotter_05", rating: 1041, wins: 9, games: 15 },
  { profileId: "cf_seeded_spotter_06", rating: 1028, wins: 8, games: 14 },
  { profileId: "cf_seeded_spotter_07", rating: 1011, wins: 7, games: 13 },
  { profileId: "cf_seeded_spotter_08", rating: 998, wins: 5, games: 10 },
  { profileId: "cf_seeded_spotter_09", rating: 986, wins: 4, games: 9 },
  { profileId: "cf_seeded_spotter_17", rating: 973, wins: 3, games: 8 },
];

export async function loadLeaderboard(limit = DEFAULT_LEADERBOARD_LIMIT): Promise<Leaderboard> {
  const normalizedLimit = normalizeLeaderboardLimit(limit);

  try {
    const searchParams = new URLSearchParams({ limit: String(normalizedLimit) });
    const response = await fetch(`${LEADERBOARD_API_PATH}?${searchParams}`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Leaderboard could not be loaded.");
    }

    const payload = (await response.json()) as Leaderboard;
    if (!isLeaderboard(payload)) {
      throw new Error("Leaderboard response is not valid.");
    }

    return withSeededLeaderboardEntries(payload, normalizedLimit);
  } catch {
    return createSeededLeaderboard(normalizedLimit);
  }
}

function isLeaderboard(value: unknown): value is Leaderboard {
  if (!value || typeof value !== "object") {
    return false;
  }

  const leaderboard = value as Leaderboard;
  return (
    isFiniteNumber(leaderboard.generatedAt) &&
    Array.isArray(leaderboard.fakers) &&
    Array.isArray(leaderboard.spotters) &&
    leaderboard.fakers.every(isLeaderboardEntry) &&
    leaderboard.spotters.every(isLeaderboardEntry)
  );
}

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as LeaderboardEntry;
  return (
    typeof entry.profileId === "string" &&
    typeof entry.displayName === "string" &&
    isFiniteNumber(entry.rank) &&
    isFiniteNumber(entry.rating) &&
    isFiniteNumber(entry.wins) &&
    isFiniteNumber(entry.games)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function createSeededLeaderboard(limit: number): Leaderboard {
  return withSeededLeaderboardEntries(
    {
      generatedAt: Math.floor(Date.now() / 1000),
      fakers: [],
      spotters: [],
    },
    limit,
  );
}

function withSeededLeaderboardEntries(leaderboard: Leaderboard, limit: number): Leaderboard {
  const fakers = leaderboard.fakers.map(normalizeLeaderboardEntryDisplayName);
  const spotters = leaderboard.spotters.map(normalizeLeaderboardEntryDisplayName);

  return {
    generatedAt: leaderboard.generatedAt,
    fakers: mergeSeededEntries(fakers, SEEDED_FAKER_ENTRIES, limit),
    spotters: mergeSeededEntries(spotters, SEEDED_SPOTTER_ENTRIES, limit),
  };
}

function normalizeLeaderboardEntryDisplayName(entry: LeaderboardEntry): LeaderboardEntry {
  return {
    ...entry,
    displayName: resolveGeneratedProfileDisplayName(entry.profileId, entry.displayName),
  };
}

function mergeSeededEntries(
  realEntries: LeaderboardEntry[],
  seededEntries: SeededLeaderboardEntry[],
  limit: number,
): LeaderboardEntry[] {
  const usedProfileIds = new Set(realEntries.map((entry) => entry.profileId));
  const usedDisplayNames = new Set(realEntries.map((entry) => entry.displayName.toLocaleLowerCase()));
  const mergedEntries = [...realEntries];

  // These are local-only placeholders so the early leaderboard feels inhabited without seeding D1.
  for (const seededEntry of seededEntries) {
    const displayName = createDefaultDisplayName(seededEntry.profileId);
    const normalizedDisplayName = displayName.toLocaleLowerCase();
    if (usedProfileIds.has(seededEntry.profileId) || usedDisplayNames.has(normalizedDisplayName)) {
      continue;
    }

    mergedEntries.push({
      ...seededEntry,
      displayName,
      rank: 0,
    });
    usedProfileIds.add(seededEntry.profileId);
    usedDisplayNames.add(normalizedDisplayName);
  }

  return rankLeaderboardEntries(mergedEntries.sort(compareLeaderboardEntries).slice(0, limit));
}

function rankLeaderboardEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return entries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

function compareLeaderboardEntries(first: LeaderboardEntry, second: LeaderboardEntry): number {
  return (
    second.rating - first.rating ||
    second.wins - first.wins ||
    second.games - first.games ||
    first.displayName.localeCompare(second.displayName)
  );
}

function normalizeLeaderboardLimit(limit: number): number {
  if (!Number.isInteger(limit)) {
    return DEFAULT_LEADERBOARD_LIMIT;
  }

  return Math.max(1, Math.min(MAX_LEADERBOARD_LIMIT, limit));
}
