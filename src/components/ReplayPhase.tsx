import { Check, Pause, Play, RotateCcw, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { findSnapshotActor, getActorTrail, getReplayFrame } from "../game/replay";
import type { ActorSnapshot, ReplayRecording } from "../game/types";
import GameCanvas from "./GameCanvas";

type ReplayPhaseProps = {
  recording: ReplayRecording;
  guessActorId?: string | null;
  onGuess: (actorId: string) => void;
  onChallengeBack: () => void;
  showChallengeIntro?: boolean;
};

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2];

export default function ReplayPhase({
  recording,
  guessActorId = null,
  onGuess,
  onChallengeBack,
  showChallengeIntro = false,
}: ReplayPhaseProps) {
  const [replayTime, setReplayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(!showChallengeIntro);
  const [introOpen, setIntroOpen] = useState(showChallengeIntro);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [debugOverlay, setDebugOverlay] = useState(false);
  const lastTickRef = useRef<number | null>(null);
  const frame = useMemo(() => getReplayFrame(recording, replayTime), [recording, replayTime]);
  const isRevealed = guessActorId != null;
  const correctGuess = guessActorId === recording.humanActorId;
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

  useEffect(() => {
    setIntroOpen(showChallengeIntro);
    setIsPlaying(!showChallengeIntro);
    setReplayTime(0);
    setSelectedActorId(null);
    lastTickRef.current = null;
  }, [recording, showChallengeIntro]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
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
  }

  function handleRestart() {
    setReplayTime(0);
    setIsPlaying(true);
  }

  function handleScrub(value: string) {
    setReplayTime(Number(value));
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

        <div className="canvas-shell">
          <GameCanvas
            mode="replay"
            recording={recording}
            frame={frame}
            selectedActorId={visibleSelectedActorId}
            guessActorId={guessActorId}
            humanActorId={recording.humanActorId}
            reveal={isRevealed}
            trailPoints={revealTrail}
            debugOverlay={debugOverlay}
            onActorClick={isRevealed ? undefined : setSelectedActorId}
          />
        </div>

        <div className="replay-controls" aria-label="Replay controls">
          <button
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
      </section>

      <aside className="side-panel">
        {isRevealed ? (
          <>
            <div className="side-section">
              <p className="panel-label">Reveal</p>
              <strong>{correctGuess ? "You found the Clanker Faker" : "The Clanker Faker got away"}</strong>
              <p>The highlighted clanker was secretly human. Keep scrubbing the replay to study the run.</p>
            </div>

            <div className="side-section">
              <p className="panel-label">Challenge back</p>
              <strong>{correctGuess ? "Now see if they can spot you" : "Think you can blend in better?"}</strong>
              <p>
                {correctGuess
                  ? "Record your own run and send a challenge back."
                  : "Record your own run, become the fake clanker, and send it back."}
              </p>
            </div>

            <button className="primary-button primary-button--wide" type="button" onClick={onChallengeBack}>
              <Send size={20} aria-hidden="true" />
              Challenge Back
            </button>
          </>
        ) : (
          <>
            <div className="side-section">
              <p className="panel-label">Accusation</p>
              <strong>{visibleSelectedActor ? "Clanker selected" : "No clanker selected"}</strong>
              <p>Click a clanker on the replay canvas, then lock the guess.</p>
            </div>

            <button
              className="primary-button primary-button--wide"
              type="button"
              disabled={!visibleSelectedActorId}
              onClick={handleConfirmGuess}
            >
              <Check size={20} aria-hidden="true" />
              Confirm Guess
            </button>
          </>
        )}
      </aside>

      {introOpen && (
        <div className="challenge-modal-backdrop" role="presentation">
          <section
            className="challenge-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="challenge-modal-title"
          >
            <h1 id="challenge-modal-title">Someone is challenging you to spot their Clanker Faker</h1>
            <p>
              One of these bots was secretly controlled by a human. Their job was to collect 3 blue
              points in 45 seconds while blending in with the clankers.
            </p>
            <p>
              Watch the round, study the movement, and pick the human controlled bot that's the
              Clanker Faker.
            </p>
            <button className="primary-button" type="button" onClick={handleStartChallenge}>
              <Play size={20} aria-hidden="true" />
              Watch Replay
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function isActorUnderCover(actor: ActorSnapshot, recording: ReplayRecording): boolean {
  return recording.map.coverZones.some(
    (zone) => Math.hypot(actor.x - zone.center.x, actor.y - zone.center.y) <= zone.radius,
  );
}
