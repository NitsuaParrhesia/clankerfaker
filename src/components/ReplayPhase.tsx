import { Check, Pause, Play, RotateCcw, Search, Send, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ROUND_DURATION } from "../game/constants";
import { findSnapshotActor, getActorTrail, getReplayFrame } from "../game/replay";
import { ReviewSubmissionError, submitReviewGuess } from "../game/reviews";
import type { ReviewResult } from "../game/reviews";
import type { ActorSnapshot, AlarmSnapshot, MapLayer, Rect, ReplayRecording, Vector } from "../game/types";
import GameCanvas from "./GameCanvas";
import Modal from "./Modal";

type ReplayPhaseProps = {
  recording: ReplayRecording;
  replayId?: string | null;
  guessActorId?: string | null;
  onGuess: (actorId: string) => void;
  onRecordRun: () => void;
  onSpotAnother: () => void;
  introKind?: "challenge" | "pool" | null;
};

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2];
type ReviewSaveState = "idle" | "saving" | "saved" | "duplicate" | "unscored" | "self-review" | "expired" | "failed";
type ReplayEventKind = "token" | "sweeper-hit" | "pop" | "tree-enter" | "tree-exit" | "walkway" | "alarm";

type ReplayEventLogEntry = {
  id: string;
  kind: ReplayEventKind;
  timestamp: number;
  title: string;
  detail: string;
};

type ReplayEventLogStats = {
  tokens: number;
  sweeperHits: number;
  pops: number;
  treeHides: number;
  walkwayRides: number;
  alarmCorners: number;
};

type ReplayEventLog = {
  stats: ReplayEventLogStats;
  events: ReplayEventLogEntry[];
};

const ALARM_CORNER_RADIUS = 98;

export default function ReplayPhase({
  recording,
  replayId = null,
  guessActorId = null,
  onGuess,
  onRecordRun,
  onSpotAnother,
  introKind = null,
}: ReplayPhaseProps) {
  const [replayTime, setReplayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(introKind == null);
  const [introOpen, setIntroOpen] = useState(introKind != null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [debugOverlay, setDebugOverlay] = useState(false);
  const [reviewSaveState, setReviewSaveState] = useState<ReviewSaveState>("idle");
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const frame = useMemo(() => getReplayFrame(recording, replayTime), [recording, replayTime]);
  const isRevealed = guessActorId != null;
  const isPreviewOnly = replayId == null && introKind == null;
  const correctGuess = reviewResult?.correct ?? guessActorId === recording.humanActorId;
  const selectedActor = selectedActorId ? findSnapshotActor(frame, selectedActorId) : undefined;
  const selectedActorIsVisible = selectedActor ? !isActorUnderCover(selectedActor, recording) : false;
  const visibleSelectedActor = selectedActorIsVisible ? selectedActor : undefined;
  const visibleSelectedActorId = !isRevealed && selectedActorIsVisible ? selectedActorId : null;
  const selectedTrail = useMemo(
    () => (visibleSelectedActorId ? getActorTrail(recording, visibleSelectedActorId, replayTime) : []),
    [recording, replayTime, visibleSelectedActorId],
  );
  const revealTrail = useMemo(
    () => (isRevealed ? getActorTrail(recording, recording.humanActorId, replayTime) : selectedTrail),
    [isRevealed, recording, replayTime, selectedTrail],
  );
  const inspectedActorId = isRevealed ? recording.humanActorId : visibleSelectedActorId;
  const inspectedEventLog = useMemo(
    () => (inspectedActorId ? createReplayEventLog(recording, inspectedActorId) : null),
    [inspectedActorId, recording],
  );

  useEffect(() => {
    setIntroOpen(introKind != null);
    setIsPlaying(introKind == null);
    setReplayTime(0);
    setSelectedActorId(null);
    setReviewSaveState("idle");
    setReviewResult(null);
    lastTickRef.current = null;
  }, [recording, introKind]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      if (event.key.toLowerCase() === "x" && !event.repeat) {
        event.preventDefault();
        setDebugOverlay((value) => !value);
      }
    }

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      lastTickRef.current = null;
      return;
    }

    let frameId = 0;

    function tick(now: number) {
      if (lastTickRef.current == null) {
        lastTickRef.current = now;
      }

      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      setReplayTime((time) => {
        const next = Math.min(recording.duration, time + dt * playbackSpeed);
        if (next >= recording.duration) {
          setIsPlaying(false);
        }
        return next;
      });

      frameId = window.requestAnimationFrame(tick);
    }

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [isPlaying, playbackSpeed, recording.duration]);

  useEffect(() => {
    if (!isRevealed && selectedActorId && !selectedActorIsVisible) {
      setSelectedActorId(null);
    }
  }, [isRevealed, selectedActorId, selectedActorIsVisible]);

  function handleConfirmGuess() {
    if (!visibleSelectedActorId) {
      return;
    }

    setIsPlaying(false);
    onGuess(visibleSelectedActorId);

    if (!replayId) {
      setReviewSaveState("unscored");
      setReviewResult(null);
      return;
    }

    setReviewSaveState("saving");
    setReviewResult(null);
    void submitReviewGuess({ replayId, guessedActorId: visibleSelectedActorId })
      .then((result) => {
        setReviewResult(result);
        setReviewSaveState(result.selfReview ? "self-review" : result.alreadySubmitted ? "duplicate" : "saved");
      })
      .catch((error: unknown) => {
        setReviewResult(null);
        if (error instanceof ReviewSubmissionError) {
          if (error.reason === "self-review") {
            setReviewSaveState("self-review");
            return;
          }

          if (error.reason === "expired" || error.reason === "not-found") {
            setReviewSaveState("expired");
            return;
          }

          if (error.reason === "unscoreable") {
            setReviewSaveState("unscored");
            return;
          }
        }

        setReviewSaveState("failed");
      });
  }

  function handleRestart() {
    setReplayTime(0);
    setIsPlaying(true);
  }

  function handleScrub(value: string) {
    setReplayTime(Number(value));
    setIsPlaying(false);
  }

  function handleJumpToEvent(timestamp: number) {
    setReplayTime(Math.max(0, Math.min(recording.duration, timestamp)));
    setIsPlaying(false);
  }

  function handleStartChallenge() {
    setIntroOpen(false);
    setIsPlaying(true);
  }

  return (
    <main className="screen play-screen">
      <section className="game-stage">
        <div className="top-bar">
          <div>
            <h2>Who moved like a person?</h2>
          </div>
          <div className="stat-strip">
            <span>{replayTime.toFixed(1)}s</span>
          </div>
        </div>

        <div
          className="canvas-shell replay-field"
          tabIndex={isRevealed ? -1 : 0}
          role="group"
          aria-label="Replay field"
          aria-describedby={isRevealed ? undefined : "replay-keyboard-help"}
          onKeyDown={(event) => {
            if (isRevealed || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const actors = frame.actors.filter((actor) => !isActorUnderCover(actor, recording));
            if (!actors.length) return;
            const currentIndex = actors.findIndex((actor) => actor.id === visibleSelectedActorId);
            const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
            const nextIndex = currentIndex < 0 ? (direction === 1 ? 0 : actors.length - 1)
              : (currentIndex + direction + actors.length) % actors.length;
            setIsPlaying(false);
            setSelectedActorId(actors[nextIndex].id);
          }}
        >
          <GameCanvas
            mode="replay"
            recording={recording}
            frame={frame}
            selectedActorId={visibleSelectedActorId}
            guessActorId={reviewResult?.guessedActorId ?? guessActorId}
            humanActorId={recording.humanActorId}
            reveal={isRevealed}
            trailPoints={revealTrail}
            debugOverlay={debugOverlay}
            onActorClick={isRevealed ? undefined : setSelectedActorId}
          />
        </div>

        <div className="replay-controls" aria-label="Replay controls">
          <button
            ref={playButtonRef}
            className="icon-button"
            type="button"
            title={isPlaying ? "Pause replay" : "Play replay"}
            onClick={() => setIsPlaying((value) => !value)}
          >
            {isPlaying ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          </button>
          <button className="icon-button" type="button" title="Restart replay" onClick={handleRestart}>
            <RotateCcw size={18} aria-hidden="true" />
          </button>
          <div className="speed-control" aria-label="Replay speed">
            {PLAYBACK_SPEEDS.map((speed) => (
              <button
                className={speed === playbackSpeed ? "is-active" : ""}
                type="button"
                key={speed}
                aria-pressed={speed === playbackSpeed}
                onClick={() => setPlaybackSpeed(speed)}
              >
                {speed}x
              </button>
            ))}
          </div>
          <input
            className="timeline"
            aria-label="Replay timeline"
            type="range"
            min={0}
            max={recording.duration}
            step={0.05}
            value={replayTime}
            onChange={(event) => handleScrub(event.target.value)}
          />
        </div>
        {!isRevealed && <p className="replay-keyboard-help" id="replay-keyboard-help">Click a clanker to inspect it, or focus the replay field and use the arrow keys to select one.</p>}
      </section>

      <aside className="side-panel">
        {isRevealed ? (
          <>
            <div className="side-section">
              <p className="panel-label">Reveal</p>
              <strong>{correctGuess ? "You found the Clanker Faker" : "The Clanker Faker got away"}</strong>
              <p>The highlighted clanker was secretly human. Keep scrubbing the replay to study the run.</p>
              <ReviewScoreFeedback
                correctGuess={correctGuess}
                result={reviewResult}
                saveState={reviewSaveState}
              />
            </div>

            <ClankerEventLogPanel
              title="Faker log"
              log={inspectedEventLog}
              replayTime={replayTime}
              onJumpToEvent={handleJumpToEvent}
              emptyCopy="The reveal log will appear once the run is available."
            />

            <div className="side-section">
              <p className="panel-label">Next round</p>
              <strong>{correctGuess ? "Keep the streak alive" : "Run it back"}</strong>
              <p>
                {correctGuess
                  ? "Review another queued run or become the faker yourself."
                  : "Study the reveal, then try another review or record a sneakier run."}
              </p>
            </div>

            <button className="primary-button primary-button--wide" type="button" onClick={onSpotAnother}>
              <Search size={20} aria-hidden="true" />
              Spot Another Faker
            </button>
            <button className="secondary-button primary-button--wide" type="button" onClick={onRecordRun}>
              <Send size={20} aria-hidden="true" />
              Record Your Run
            </button>
          </>
        ) : (
          <>
            <div className="side-section">
              <p className="panel-label">{isPreviewOnly ? "Preview" : "Accusation"}</p>
              <strong aria-live="polite">{visibleSelectedActor ? `Clanker ${visibleSelectedActor.label} selected` : "No clanker selected"}</strong>
              <p>
                {isPreviewOnly
                  ? "Click clankers to study the run. Previewing your own replay does not submit guesses."
                  : "Select a clanker on the replay field, then lock the guess."}
              </p>
            </div>

            <ClankerEventLogPanel
              title="Clanker log"
              log={inspectedEventLog}
              replayTime={replayTime}
              onJumpToEvent={handleJumpToEvent}
              emptyCopy="Select a visible clanker to inspect its trail, token pickups, pops, and other observable events."
            />

            {!isPreviewOnly && (
              <button
                className="primary-button primary-button--wide"
                type="button"
                disabled={!visibleSelectedActorId}
                onClick={handleConfirmGuess}
              >
                <Check size={20} aria-hidden="true" />
                Confirm Guess
              </button>
            )}
          </>
        )}
      </aside>

      {introOpen && (
        <Modal className="challenge-modal" labelledBy="challenge-modal-title" onDismiss={handleStartChallenge} returnFocusRef={playButtonRef}>
          <div className="game-dialog__content">
            {introKind === "challenge" ? (
              <>
                <h1 id="challenge-modal-title" tabIndex={-1} data-modal-focus>Someone is challenging you to spot their Clanker Faker</h1>
                <p>
                  One of these bots was secretly controlled by a human. Their job was to finish a
                  public task in {ROUND_DURATION} seconds while blending in with the clankers.
                </p>
                <p>
                  Watch the round, study the movement, and pick the human controlled bot that's the
                  Clanker Faker.
                </p>
              </>
            ) : (
              <>
                <h1 id="challenge-modal-title" tabIndex={-1} data-modal-focus>Spot the queued Clanker Faker</h1>
                <p>
                  This replay came from another faker run. One clanker was secretly controlled by a
                  human trying to finish the public task without standing out.
                </p>
                <p>Watch the movement, scrub the timeline, and lock in the clanker that feels too human.</p>
              </>
            )}
          </div>
          <div className="game-dialog__actions">
            <button className="primary-button" type="button" onClick={handleStartChallenge}>
              <Play size={20} aria-hidden="true" />
              Watch Replay
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function ClankerEventLogPanel({
  title,
  log,
  replayTime,
  onJumpToEvent,
  emptyCopy,
}: {
  title: string;
  log: ReplayEventLog | null;
  replayTime: number;
  onJumpToEvent: (timestamp: number) => void;
  emptyCopy: string;
}) {
  return (
    <div className="side-section replay-event-log">
      <p className="panel-label">{title}</p>
      {log ? (
        <>
          <div className="replay-event-stats" aria-label={`${title} summary`}>
            <ReplayEventStat label="Tokens" value={log.stats.tokens} />
            <ReplayEventStat label="Pops" value={log.stats.pops} />
            <ReplayEventStat label="Sweeper hits" value={log.stats.sweeperHits} />
            <ReplayEventStat label="Tree hides" value={log.stats.treeHides} />
            <ReplayEventStat label="Walkways" value={log.stats.walkwayRides} />
            <ReplayEventStat label="Alarm corners" value={log.stats.alarmCorners} />
          </div>
          {log.events.length > 0 ? (
            <ol className="replay-event-list" aria-label={`${title} timeline`}>
              {log.events.map((event) => (
                <li key={event.id}>
                  <button
                    className={`replay-event replay-event--${event.kind} ${
                      Math.abs(event.timestamp - replayTime) < 0.25 ? "is-current" : ""
                    }`}
                    type="button"
                    onClick={() => onJumpToEvent(event.timestamp)}
                  >
                    <time>{formatReplayTimestamp(event.timestamp)}</time>
                    <span>
                      <strong>{event.title}</strong>
                      <small>{event.detail}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="replay-event-log__empty">No notable events recorded for this clanker.</p>
          )}
        </>
      ) : (
        <p className="replay-event-log__empty">{emptyCopy}</p>
      )}
    </div>
  );
}

function ReplayEventStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function createReplayEventLog(recording: ReplayRecording, actorId: string): ReplayEventLog {
  const stats: ReplayEventLogStats = {
    tokens: 0,
    sweeperHits: 0,
    pops: 0,
    treeHides: 0,
    walkwayRides: 0,
    alarmCorners: 0,
  };
  const events: ReplayEventLogEntry[] = [];
  const reachedAlarmLights = new Set<string>();
  let previousActor: ActorSnapshot | undefined;
  let previousUnderCover = false;
  let previousWalkwayId: string | null = null;

  function addEvent(kind: ReplayEventKind, timestamp: number, title: string, detail: string) {
    events.push({
      id: `${actorId}-${kind}-${events.length}`,
      kind,
      timestamp: Number(timestamp.toFixed(2)),
      title,
      detail,
    });
  }

  for (const snapshot of recording.snapshots) {
    const actor = findSnapshotActor(snapshot, actorId);
    if (!actor) {
      continue;
    }

    const underCover = isActorUnderCover(actor, recording);
    const walkwayId = getWalkwayIdForActor(actor, recording.map);
    const alarmLightId = getReachedAlarmLightId(actor, snapshot.alarm, recording.map);

    if (previousActor) {
      const tokenDelta = Math.max(0, actor.collected - previousActor.collected);
      for (let index = 0; index < tokenDelta; index += 1) {
        stats.tokens += 1;
        addEvent("token", snapshot.timestamp, "Token collected", `Picked up token ${stats.tokens}`);
      }

      if (!previousActor.stunned && actor.stunned) {
        stats.sweeperHits += 1;
        addEvent("sweeper-hit", snapshot.timestamp, "Sweeper hit", "Stunned by an enemy sweeper");
      }

      const previousRespawnProgress = previousActor.respawnProgress ?? 0;
      const respawnProgress = actor.respawnProgress ?? 0;
      const respawnJump =
        previousActor.stunned &&
        !actor.stunned &&
        distanceBetweenActors(previousActor, actor) > 80 &&
        actor.collected <= previousActor.collected;
      if ((previousRespawnProgress <= 0 && respawnProgress > 0) || respawnJump) {
        stats.pops += 1;
        addEvent("pop", snapshot.timestamp, "Popped and respawned", "Progress reset after a sweeper takedown");
      }

      if (!previousUnderCover && underCover) {
        stats.treeHides += 1;
        addEvent("tree-enter", snapshot.timestamp, "Entered tree hideout", "Hidden under the canopy");
      }

      if (previousUnderCover && !underCover) {
        addEvent("tree-exit", snapshot.timestamp, "Left tree hideout", "Returned to open view");
      }

      if (!previousWalkwayId && walkwayId) {
        stats.walkwayRides += 1;
        addEvent("walkway", snapshot.timestamp, "Rode walkway", "Stepped onto a moving walkway");
      }
    }

    if (alarmLightId && !reachedAlarmLights.has(alarmLightId)) {
      reachedAlarmLights.add(alarmLightId);
      stats.alarmCorners += 1;
      addEvent("alarm", snapshot.timestamp, "Reached alarm corner", "Arrived near the flashing corner");
    }

    previousActor = actor;
    previousUnderCover = underCover;
    previousWalkwayId = walkwayId;
  }

  return { stats, events };
}

function getWalkwayIdForActor(actor: ActorSnapshot, map: MapLayer): string | null {
  const point = actorToPoint(actor);
  return map.movingWalkways.find((walkway) => isPointInRect(point, walkway.rect))?.id ?? null;
}

function getReachedAlarmLightId(actor: ActorSnapshot, alarm: AlarmSnapshot | null, map: MapLayer): string | null {
  if (!alarm) {
    return null;
  }

  const light = map.alarmLights.find((candidate) => candidate.id === alarm.lightId);
  if (!light) {
    return null;
  }

  return distanceBetweenPoints(actorToPoint(actor), light.rallyPoint) <= ALARM_CORNER_RADIUS ? light.id : null;
}

function actorToPoint(actor: ActorSnapshot): Vector {
  return { x: actor.x, y: actor.y };
}

function isPointInRect(point: Vector, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function distanceBetweenActors(a: ActorSnapshot, b: ActorSnapshot): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceBetweenPoints(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function ReviewScoreFeedback({
  correctGuess,
  result,
  saveState,
}: {
  correctGuess: boolean;
  result: ReviewResult | null;
  saveState: ReviewSaveState;
}) {
  if (saveState === "idle") {
    return null;
  }

  const winner = correctGuess ? "Spotter win" : "Faker win";
  const rating = result?.rating;
  const hasRatedResult = Boolean(rating?.rated);
  const hasScoreChange = saveState === "saved" && result && !result.alreadySubmitted;

  return (
    <section className="score-feedback" aria-label="Scoring feedback">
      <div className="score-feedback__header">
        <span
          className={`score-feedback__pill ${
            correctGuess ? "score-feedback__pill--spotter" : "score-feedback__pill--faker"
          }`}
        >
          <Trophy size={15} aria-hidden="true" />
          {winner}
        </span>
        <strong>{getScoreFeedbackTitle(saveState, correctGuess)}</strong>
        <p>{getScoreFeedbackCopy(saveState, correctGuess)}</p>
      </div>

      <div className="score-feedback__rows">
        <ScoreFeedbackRow label="Match point" value={getMatchPointCopy(saveState, correctGuess, result)} />
        {result && (
          <ScoreFeedbackRow
            label="Run record"
            value={`Fooled ${result.aggregate.fakerWins}/${result.aggregate.reviewCount} reviewers (${formatPercent(result.aggregate.fooledRate)})`}
          />
        )}
        <ScoreFeedbackRow
          label="Spotter rating"
          tone={hasScoreChange ? getDeltaTone(rating?.spotterDelta ?? 0) : "neutral"}
          value={getRatingCopy(saveState, rating?.spotterDelta, rating?.spotterRating, hasRatedResult)}
        />
        <ScoreFeedbackRow
          label="Faker rating"
          tone={hasScoreChange ? getDeltaTone(rating?.fakerDelta ?? 0) : "neutral"}
          value={getRatingCopy(saveState, rating?.fakerDelta, rating?.fakerRating, hasRatedResult)}
        />
      </div>
    </section>
  );
}

function ScoreFeedbackRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="score-feedback__row">
      <span>{label}</span>
      <strong className={`score-feedback__value score-feedback__value--${tone}`}>{value}</strong>
    </div>
  );
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function getScoreFeedbackTitle(state: ReviewSaveState, correctGuess: boolean): string {
  switch (state) {
    case "saving":
      return "Scoring the review";
    case "saved":
      return correctGuess ? "Your read counted" : "The faker scored";
    case "duplicate":
      return "Already counted";
    case "unscored":
      return "Direct challenge only";
    case "self-review":
      return "Self-review not scored";
    case "expired":
      return "Replay no longer scored";
    case "failed":
      return "Revealed, but not scored";
    default:
      return correctGuess ? "Spotter win" : "Faker win";
  }
}

function getScoreFeedbackCopy(state: ReviewSaveState, correctGuess: boolean): string {
  switch (state) {
    case "saving":
      return "Saving the result and updating the run record.";
    case "saved":
      return correctGuess
        ? "The spotter gets the match point and the faker loses this review."
        : "The faker fooled this review and gets the match point.";
    case "duplicate":
      return "You already reviewed this replay, so the leaderboard was left unchanged.";
    case "unscored":
      return correctGuess
        ? "You found them, but direct challenge links do not affect leaderboard ratings."
        : "The faker fooled you, but direct challenge links do not affect leaderboard ratings.";
    case "self-review":
      return "You recorded this replay, so your ratings and win totals stay unchanged. Use Spot a Faker to review someone else's run.";
    case "expired":
      return "This replay is no longer available for leaderboard scoring, but the reveal still works.";
    case "failed":
      return "The reveal still works, but the scoring service could not be reached.";
    default:
      return "";
  }
}

function getMatchPointCopy(state: ReviewSaveState, correctGuess: boolean, result: ReviewResult | null): string {
  if (state === "saving") {
    return "Pending";
  }

  if (state === "failed") {
    return "Not saved";
  }

  if (state === "unscored" || state === "self-review" || state === "expired") {
    return "No leaderboard point";
  }

  if (state === "duplicate" || result?.alreadySubmitted) {
    return "Already counted";
  }

  return correctGuess ? "Spotter +1" : "Faker +1";
}

function getRatingCopy(
  state: ReviewSaveState,
  delta: number | undefined,
  rating: number | null | undefined,
  rated: boolean,
): string {
  if (state === "saving") {
    return "Pending";
  }

  if (state === "failed") {
    return "Not saved";
  }

  if (state === "unscored" || state === "self-review" || state === "expired" || !rated || rating == null) {
    return "No change";
  }

  if (state === "duplicate" || delta == null) {
    return `Current ${Math.round(rating)}`;
  }

  return `${formatSignedNumber(delta)} to ${Math.round(rating)}`;
}

function getDeltaTone(delta: number): "positive" | "negative" | "neutral" {
  if (delta > 0) {
    return "positive";
  }

  if (delta < 0) {
    return "negative";
  }

  return "neutral";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatReplayTimestamp(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(clamped / 60);
  const remainingSeconds = clamped % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function isActorUnderCover(actor: ActorSnapshot, recording: ReplayRecording): boolean {
  return recording.map.coverZones.some(
    (zone) => Math.hypot(actor.x - zone.center.x, actor.y - zone.center.y) <= zone.radius,
  );
}
