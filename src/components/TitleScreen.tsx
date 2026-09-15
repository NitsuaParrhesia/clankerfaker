import {
  CircleHelp,
  Play,
  Search,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { loadLeaderboard, type Leaderboard, type LeaderboardEntry } from "../game/leaderboard";
import { getLocalProfile, resolveProfileDisplayName } from "../game/profile";
import { loadLocalProfileStats, type ProfileStats } from "../game/profileStats";
import Modal from "./Modal";

type TitleScreenProps = {
  onStart: () => void;
  onReview: () => void;
  onLeaderboard: () => void;
};

export default function TitleScreen({ onStart, onReview, onLeaderboard }: TitleScreenProps) {
  const [localProfile] = useState(() => getLocalProfile());
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [statsStatus, setStatsStatus] = useState<"loading" | "ready" | "empty">("loading");
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [leaderboardStatus, setLeaderboardStatus] = useState<"loading" | "ready" | "empty">("loading");
  const [leaderboardTab, setLeaderboardTab] = useState<"fakers" | "spotters">("fakers");
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);

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
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLeaderboardStatus("loading");

    void loadLeaderboard()
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
  }, []);

  const displayName = resolveProfileDisplayName(profileStats?.profile.displayName, localProfile);
  const activeLeaderboardEntries = leaderboardTab === "fakers" ? leaderboard?.fakers : leaderboard?.spotters;

  return (
    <main className="screen title-screen">
      <section className="title-lobby">
        <div className="title-hero">
          <img className="title-logo" src="/assets/logo.webp" alt="Clanker Faker" width="720" height="720" />
          <div className="title-copy">
            <h1 className="title-tagline">One of these clankers is human. Can you spot them?</h1>
            <p className="lead">Act normal. Complete the task. Fool the replay reviewers.</p>
          </div>
          <div className="title-actions">
            <button className="primary-button title-action-button" type="button" onClick={onStart}>
              <Play size={20} aria-hidden="true" />
              Be a Clanker
            </button>
            <button className="secondary-button title-action-button" type="button" onClick={onReview}>
              <Search size={20} aria-hidden="true" />
              Spot a Faker
            </button>
            <button className="secondary-button title-action-button" type="button" onClick={() => setHowToPlayOpen(true)}>
              <CircleHelp size={20} aria-hidden="true" />
              How to Play
            </button>
          </div>
        </div>

      </section>

      <section className="lobby-dashboard" aria-label="Clanker lobby">
        <section className="profile-record-card" aria-label="Your Clanker record">
          <div className="profile-record-card__hero">
            <span className="profile-record-card__avatar" aria-hidden="true">
              <img src="/assets/robot.webp" alt="" />
            </span>
            <div className="profile-record-card__header">
              <p className="eyebrow">Your Clanker Record</p>
              <strong>{displayName}</strong>
            </div>
            <span className="profile-record-card__token" aria-hidden="true">
              <img src="/assets/token.webp" alt="" />
            </span>
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
        <section className="leaderboard-card" aria-label="Clanker leaderboard">
          <div className="leaderboard-card__header">
            <div className="leaderboard-card__title">
              <span className="leaderboard-card__badge" aria-hidden="true">
                <Trophy size={22} />
              </span>
              <div>
                <p className="eyebrow">Leaderboard</p>
                <strong>{leaderboardTab === "fakers" ? "Top Clankers" : "Top Spotters"}</strong>
              </div>
            </div>
            <div className="leaderboard-tabs" aria-label="Leaderboard type">
              <button
                className={leaderboardTab === "fakers" ? "is-active" : ""}
                type="button"
                aria-pressed={leaderboardTab === "fakers"}
                onClick={() => setLeaderboardTab("fakers")}
              >
                Clankers
              </button>
              <button
                className={leaderboardTab === "spotters" ? "is-active" : ""}
                type="button"
                aria-pressed={leaderboardTab === "spotters"}
                onClick={() => setLeaderboardTab("spotters")}
              >
                Spotters
              </button>
            </div>
          </div>
          <LeaderboardBoard
            title={leaderboardTab === "fakers" ? "Clankers" : "Spotters"}
            metricLabel={leaderboardTab === "fakers" ? "Clanker Rating" : "Spotter Rating"}
            emptyCopy={getLeaderboardStatusCopy(leaderboardStatus, activeLeaderboardEntries)}
            entries={activeLeaderboardEntries ?? []}
            localProfileId={localProfile.id}
          />
          <button className="secondary-button leaderboard-card__action" type="button" onClick={onLeaderboard}>
            <Trophy size={18} aria-hidden="true" />
            View Leaderboard
          </button>
        </section>

      </section>
      {howToPlayOpen && (
        <HowToPlayModal
          onClose={() => setHowToPlayOpen(false)}
          onStart={() => {
            setHowToPlayOpen(false);
            onStart();
          }}
          onReview={() => {
            setHowToPlayOpen(false);
            onReview();
          }}
        />
      )}
    </main>
  );
}

function HowToPlayModal({
  onClose,
  onStart,
  onReview,
}: {
  onClose: () => void;
  onStart: () => void;
  onReview: () => void;
}) {
  return (
    <Modal className="how-to-play-modal" labelledBy="how-to-play-title" onDismiss={onClose}>
      <div className="game-dialog__content">
        <div className="how-to-play-modal__top">
          <div>
            <p className="eyebrow">Quick start</p>
            <h1 id="how-to-play-title" tabIndex={-1} data-modal-focus>Act like a bot. Catch the human.</h1>
            <p className="how-to-play-modal__lead">
              Clanker Faker has two jobs: hide in the replay, or watch the replay and call out the fake.
            </p>
          </div>
          <button
            className="icon-button how-to-play-modal__close"
            type="button"
            aria-label="Close how to play"
            title="Close"
            onClick={onClose}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <div className="how-to-play-guide">
          <section className="how-to-play-card">
            <div className="how-to-play-card__header">
              <HowToPlayCardAsset src="/assets/robot.webp" alt="" />
              <div>
                <p className="eyebrow">Faker</p>
                <h2>Be a Clanker</h2>
              </div>
            </div>
            <ol className="how-to-play-steps">
              <HowToPlayStep title="Read the brief" copy="Before the countdown, your clanker and objective are shown." />
              <HowToPlayStep title="Finish the task" copy="Collect three tokens and complete one public errand before time runs out." />
              <HowToPlayStep title="Do it badly on purpose" copy="Use pauses, detours, and the tree hideout so your route does not look optimized." />
            </ol>
          </section>

          <section className="how-to-play-card">
            <div className="how-to-play-card__header">
              <HowToPlayCardAsset src="/assets/robot.webp" alt="" variant="suspect" />
              <div>
                <p className="eyebrow">Spotter</p>
                <h2>Spot a Faker</h2>
              </div>
            </div>
            <ol className="how-to-play-steps">
              <HowToPlayStep title="Watch the replay" copy="Scrub, pause, and follow suspicious clankers." />
              <HowToPlayStep title="Look for intention" copy="Humans beeline, overreact, hesitate weirdly, or dodge danger too smartly." />
              <HowToPlayStep title="Lock the guess" copy="Click the clanker you think was human, then reveal the answer." />
            </ol>
          </section>
        </div>

        <section className="how-to-play-mechanics" aria-label="Important mechanics">
          <div className="how-to-play-mechanics__header">
            <p className="eyebrow">During the run</p>
            <strong>Stuff that changes the read</strong>
          </div>
          <div className="how-to-play-mechanic-grid">
            <HowToPlayMechanic
              asset={{ src: "/assets/token.webp", alt: "Token collectible" }}
              title="Tokens"
              copy="Collect three tokens while making the route look routine."
            />
            <HowToPlayMechanic
              asset={{ src: "/assets/red-alarm-light-on.webp", alt: "Red alarm light" }}
              title="Alarm lights"
              copy="When a corner alarm flashes, the bots drift toward that corner."
            />
            <HowToPlayMechanic
              asset={{ src: "/assets/stun-bot.webp", alt: "Enemy sweeper bot" }}
              title="Enemy sweepers"
              copy="If a sweeper catches a clanker, it gets stunned, pops, and respawns with no points."
            />
            <HowToPlayMechanic
              asset={{ src: "/assets/tree-hideout.webp", alt: "Tree hideout" }}
              title="Tree hideout"
              copy="Step behind the canopy to vanish briefly, then re-enter the crowd cleanly."
            />
          </div>
        </section>
      </div>
      <div className="game-dialog__actions how-to-play-modal__actions">
        <button className="secondary-button" type="button" onClick={onReview}>
          <Search size={18} aria-hidden="true" />
          Spot a Faker
        </button>
        <button className="primary-button" type="button" onClick={onStart}>
          <Play size={18} aria-hidden="true" />
          Be a Clanker
        </button>
      </div>
    </Modal>
  );
}

function HowToPlayStep({ title, copy }: { title: string; copy: string }) {
  return (
    <li>
      <strong>{title}</strong>
      <span>{copy}</span>
    </li>
  );
}

function HowToPlayCardAsset({
  src,
  alt,
  variant = "default",
}: {
  src: string;
  alt: string;
  variant?: "default" | "suspect";
}) {
  return (
    <span className={`how-to-play-card__asset how-to-play-card__asset--${variant}`} aria-hidden="true">
      <img src={src} alt={alt} />
    </span>
  );
}

function HowToPlayMechanic({
  asset,
  title,
  copy,
}: {
  asset: { src: string; alt: string };
  title: string;
  copy: string;
}) {
  return (
    <div className="how-to-play-mechanic">
      <HowToPlayMechanicAsset asset={asset} />
      <div>
        <strong>{title}</strong>
        <span>{copy}</span>
      </div>
    </div>
  );
}

function HowToPlayMechanicAsset({ asset }: { asset: { src: string; alt: string } }) {
  return (
    <span className="how-to-play-mechanic__asset" aria-hidden="true">
      <img src={asset.src} alt={asset.alt} />
    </span>
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
              className={`leaderboard-row leaderboard-row--rank-${Math.min(entry.rank, 3)} ${
                entry.profileId === localProfileId ? "is-local-profile" : ""
              }`}
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
        <div className="leaderboard-empty">
          <Trophy size={18} aria-hidden="true" />
          <span>{emptyCopy}</span>
        </div>
      )}
    </section>
  );
}

function getStatsStatusCopy(status: "loading" | "ready" | "empty", stats: ProfileStats | null): string {
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

function getLeaderboardStatusCopy(
  status: "loading" | "ready" | "empty",
  entries: LeaderboardEntry[] | undefined,
): string {
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
