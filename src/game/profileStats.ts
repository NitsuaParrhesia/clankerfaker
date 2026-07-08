import { getLocalProfile } from "./profile";

const PROFILE_API_PATH = "/api/profile";

export type ProfileStats = {
  profile: {
    id: string;
    displayName: string | null;
    createdAt: number;
    lastSeenAt: number;
  };
  totals: {
    roundsRecorded: number;
    replaysReviewed: number;
    fakerWins: number;
    spotterWins: number;
    fakerRating: number;
    spotterRating: number;
  };
  rates: {
    spotterAccuracy: number;
    activeFakerFooledRate: number;
  };
  activeRuns: {
    count: number;
    reviewCount: number;
    fakerWins: number;
    spotterWins: number;
  };
};

export async function loadLocalProfileStats(): Promise<ProfileStats> {
  const profile = getLocalProfile();
  const searchParams = new URLSearchParams({ profileId: profile.id });
  const response = await fetch(`${PROFILE_API_PATH}?${searchParams}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Profile stats could not be loaded.");
  }

  const payload = (await response.json()) as ProfileStats;
  if (!isProfileStats(payload)) {
    throw new Error("Profile stats response is not valid.");
  }

  return payload;
}

function isProfileStats(value: unknown): value is ProfileStats {
  if (!value || typeof value !== "object") {
    return false;
  }

  const stats = value as ProfileStats;
  return (
    typeof stats.profile?.id === "string" &&
    (typeof stats.profile.displayName === "string" || stats.profile.displayName == null) &&
    isFiniteNumber(stats.profile.createdAt) &&
    isFiniteNumber(stats.profile.lastSeenAt) &&
    isFiniteNumber(stats.totals?.roundsRecorded) &&
    isFiniteNumber(stats.totals.replaysReviewed) &&
    isFiniteNumber(stats.totals.fakerWins) &&
    isFiniteNumber(stats.totals.spotterWins) &&
    isFiniteNumber(stats.totals.fakerRating) &&
    isFiniteNumber(stats.totals.spotterRating) &&
    isFiniteNumber(stats.rates?.spotterAccuracy) &&
    isFiniteNumber(stats.rates.activeFakerFooledRate) &&
    isFiniteNumber(stats.activeRuns?.count) &&
    isFiniteNumber(stats.activeRuns.reviewCount) &&
    isFiniteNumber(stats.activeRuns.fakerWins) &&
    isFiniteNumber(stats.activeRuns.spotterWins)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
