import { Play, RefreshCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { loadLeaderboard, type Leaderboard, type LeaderboardEntry } from "../game/leaderboard";
import { getLocalProfile, resolveProfileDisplayName } from "../game/profile";
import { loadLocalProfileStats, type ProfileStats } from "../game/profileStats";

type LeaderboardScreenProps = {
  onStart: () => void;
  onReview: () => void;
};

type LoadStatus = "loading" | "ready" | "empty";

export default function LeaderboardScreen({ onStart, onReview }: LeaderboardScreenProps) {
  const [localProfile] = useState(() => getLocalProfile());
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [statsStatus, setStatsStatus] = useState<LoadStatus>("loading");
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [leaderboardStatus, setLeaderboardStatus] = useState<LoadStatus>("loading");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatsStatus("loading");

    void loadLocalProfileStats()
      .then((stats) => {
        if (!cancelled) {
          setProfileStats(stats);
          setStatsStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfileStats(null);
          setStatsStatus("empty");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setLeaderboardStatus("loading");

    void loadLeaderboard(10)
      .then((nextLeaderboard) => {
        if (!cancelled) {
          setLeaderboard(nextLeaderboard);
          setLeaderboardStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeaderboard(null);
          setLeaderboardStatus("empty");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const displayName = resolveProfileDisplayName(profileStats?.profile.displayName, localProfile);

  return (
    <main className="screen leaderboard-screen">
      <section className="leaderboard-page-hero">
        <div>
          <p className="eyebrow">Leaderboard</p>
          <h1>Top Clankers</h1>
          <p className="lead">Faker and spotter ratings update when queued reviews are scored.</p>
        </div>
        <div className="leaderboard-page-actions">
          <button className="primary-button" type="button" onClick={onStart}>
            <Play size={20} aria-hidden="true" />
            Be a Clanker
          </button>
          <button className="secondary-button" type="button" onClick={onReview}>
            <Search size={20} aria-hidden="true" />
            Spot a Faker
          </button>
          <button className="secondary-button" type="button" onClick={() => setRefreshKey((value) => value + 1)}>
            <RefreshCcw size={20} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </section>

      <section className="leaderboard-page-grid" aria-label="Leaderboard details">
        <section className="profile-record-card" aria-label="Your Clanker record">
          <div className="profile-record-card__header">
            <p className="eyebrow">Your Clanker Record</p>
            <strong>{displayName}</strong>
          </div>
          <div className="profile-rating-row">
            <ProfileStat label="Faker Rating" value={formatRating(profileStats?.totals.fakerRating)} />
            <ProfileStat label="Spotter Rating" value={formatRating(profileStats?.totals.spotterRating)} />
          </div>
          <div className="profile-stat-grid">
            <ProfileStat label="Runs" value={formatCount(profileStats?.totals.roundsRecorded)} />
            <ProfileStat label="Reviews" value={formatCount(profileStats?.totals.replaysReviewed)} />
            <ProfileStat label="Faker Wins" value={formatCount(profileStats?.totals.fakerWins)} />
            <ProfileStat label="Spotter Wins" value={formatCount(profileStats?.totals.spotterWins)} />
            <ProfileStat label="Accuracy" value={formatPercent(profileStats?.rates.spotterAccuracy)} />
            <ProfileStat label="Active Runs" value={formatCount(profileStats?.activeRuns.count)} />
          </div>
          <p className="profile-record-card__note">{getStatsStatusCopy(statsStatus, profileStats)}</p>
        </section>

        <section className="leaderboard-card leaderboard-card--full" aria-label="Faker leaderboard">
          <LeaderboardBoard
            title="Fakers"
            metricLabel="Faker Rating"
            emptyCopy={getLeaderboardStatusCopy(leaderboardStatus, leaderboard?.fakers)}
            entries={leaderboard?.fakers ?? []}
            localProfileId={localProfile.id}
          />
        </section>

        <section className="leaderboard-card leaderboard-card--full" aria-label="Spotter leaderboard">
          <LeaderboardBoard
            title="Spotters"
            metricLabel="Spotter Rating"
            emptyCopy={getLeaderboardStatusCopy(leaderboardStatus, leaderboard?.spotters)}
            entries={leaderboard?.spotters ?? []}
            localProfileId={localProfile.id}
          />
        </section>
      </section>
    </main>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LeaderboardBoard({
  title,
  metricLabel,
  emptyCopy,
  entries,
  localProfileId,
}: {
  title: string;
  metricLabel: string;
  emptyCopy: string;
  entries: LeaderboardEntry[];
  localProfileId: string;
}) {
  return (
    <section className="leaderboard-board">
      <div className="leaderboard-board__title">
        <strong>{title}</strong>
        <span>{metricLabel}</span>
      </div>
      {entries.length > 0 ? (
        <ol className="leaderboard-list">
          {entries.map((entry) => (
            <li
              className={`leaderboard-row ${entry.profileId === localProfileId ? "is-local-profile" : ""}`}
              key={`${title}-${entry.profileId}`}
            >
              <span className="leaderboard-rank">{entry.rank}</span>
              <span className="leaderboard-name">{entry.displayName}</span>
              <strong>{formatRating(entry.rating)}</strong>
              <span className="leaderboard-meta">
                {entry.wins}/{entry.games}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="leaderboard-empty">{emptyCopy}</p>
      )}
    </section>
  );
}

function getStatsStatusCopy(status: LoadStatus, stats: ProfileStats | null): string {
  if (status === "loading") {
    return "Loading record...";
  }

  if (!stats || stats.totals.roundsRecorded + stats.totals.replaysReviewed === 0) {
    return "No scored matches yet.";
  }

  if (stats.activeRuns.reviewCount > 0) {
    return `Active runs have fooled ${stats.activeRuns.fakerWins}/${stats.activeRuns.reviewCount} reviewers.`;
  }

  return "Record updated.";
}

function getLeaderboardStatusCopy(status: LoadStatus, entries: LeaderboardEntry[] | undefined): string {
  if (status === "loading") {
    return "Loading leaderboard...";
  }

  if (status === "ready" && entries?.length === 0) {
    return "No ranked clankers yet.";
  }

  return "Leaderboard unavailable.";
}

function formatCount(value?: number): string {
  return String(value ?? 0);
}

function formatRating(value?: number): string {
  return String(Math.round(value ?? 1000));
}

function formatPercent(value?: number): string {
  return `${Math.round((value ?? 0) * 100)}%`;
}
