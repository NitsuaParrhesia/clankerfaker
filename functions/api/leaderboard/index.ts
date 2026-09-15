const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const LEGACY_DEFAULT_DISPLAY_NAME_PATTERN = /^Clanker [A-Z0-9]{4}$/u;
const CURRENT_DEFAULT_DISPLAY_NAME_PATTERN = /^[A-Za-z]+[A-Za-z]+#\d{4}$/u;
const NAME_ADJECTIVES = [
  "Sneaky",
  "Rusty",
  "Chrome",
  "Static",
  "Wobbly",
  "Turbo",
  "Covert",
  "Shifty",
  "Jittery",
  "Secret",
  "Spark",
  "Rogue",
  "Fizzy",
  "Patchy",
  "Clever",
  "Tinny",
];
const NAME_NOUNS = [
  "Servo",
  "Clanker",
  "Circuit",
  "Widget",
  "Cog",
  "Bolt",
  "Module",
  "Gizmo",
  "Decoy",
  "Switch",
  "Scanner",
  "Gear",
  "Relay",
  "Bot",
  "Droid",
  "Unit",
];

type LeaderboardKind = "faker" | "spotter";

type LeaderboardRow = {
  id: string;
  display_name: string | null;
  rating: number | null;
  wins: number | null;
  games: number | null;
};

type LeaderboardEntry = {
  profileId: string;
  displayName: string;
  rank: number;
  rating: number;
  wins: number;
  games: number;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const limit = normalizeLimit(url.searchParams.get("limit"));
  const [fakers, spotters] = await Promise.all([
    getLeaderboard(env.REPLAY_DB, "faker", limit),
    getLeaderboard(env.REPLAY_DB, "spotter", limit),
  ]);

  return jsonResponse({
    generatedAt: Math.floor(Date.now() / 1000),
    fakers,
    spotters,
  });
};

async function getLeaderboard(
  database: D1Database,
  kind: LeaderboardKind,
  limit: number,
): Promise<LeaderboardEntry[]> {
  const query =
    kind === "faker"
      ? `SELECT
           id,
           display_name,
           faker_rating AS rating,
           faker_wins AS wins,
           rounds_recorded AS games
         FROM profiles
         WHERE rounds_recorded > 0
         ORDER BY faker_rating DESC, faker_wins DESC, rounds_recorded DESC, last_seen_at DESC
         LIMIT ?`
      : `SELECT
           id,
           display_name,
           spotter_rating AS rating,
           spotter_wins AS wins,
           replays_reviewed AS games
         FROM profiles
         WHERE replays_reviewed > 0
         ORDER BY spotter_rating DESC, spotter_wins DESC, replays_reviewed DESC, last_seen_at DESC
         LIMIT ?`;

  const { results } = await database.prepare(query).bind(limit).all<LeaderboardRow>();
  return results.map((row, index) => ({
    profileId: row.id,
    displayName: getDisplayName(row.id, row.display_name),
    rank: index + 1,
    rating: numberOrDefault(row.rating, 1000),
    wins: numberOrZero(row.wins),
    games: numberOrZero(row.games),
  }));
}

function normalizeLimit(value: string | null): number {
  if (!value) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(MAX_LIMIT, parsed)) : DEFAULT_LIMIT;
}

function getDisplayName(profileId: string, displayName: string | null): string {
  const normalized = displayName?.trim();
  if (normalized && !isOutdatedDefaultDisplayName(normalized)) {
    return normalized.slice(0, 32);
  }

  return createDefaultDisplayName(profileId);
}

function createDefaultDisplayName(profileId: string): string {
  const firstIndex = hashString(`${profileId}:adjective`) % NAME_ADJECTIVES.length;
  const secondIndex = hashString(`${profileId}:noun`) % NAME_NOUNS.length;
  const idNumber = String(hashString(`${profileId}:tag`) % 10_000).padStart(4, "0");
  return `${NAME_ADJECTIVES[firstIndex]}${NAME_NOUNS[secondIndex]}#${idNumber}`;
}

function isOutdatedDefaultDisplayName(displayName: string): boolean {
  return (
    LEGACY_DEFAULT_DISPLAY_NAME_PATTERN.test(displayName) ||
    !CURRENT_DEFAULT_DISPLAY_NAME_PATTERN.test(displayName) ||
    isOldWordBankDisplayName(displayName)
  );
}

function isOldWordBankDisplayName(displayName: string): boolean {
  return NAME_ADJECTIVES.some((adjective) =>
    NAME_NOUNS.some((noun) => displayName === `${adjective} ${noun}` || displayName === `${adjective}${noun}`),
  );
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
