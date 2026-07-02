import { Flag, RotateCcw, Timer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTDOWN_SECONDS, SNAPSHOT_INTERVAL } from "../game/constants";
import { createRecording, createSnapshot } from "../game/replay";
import {
  cloneGameStateForRender,
  createInitialGame,
  findHumanActor,
  stepSimulation,
} from "../game/simulation";
import type { GameState, InputState, ReplayRecording, ReplaySnapshot } from "../game/types";
import GameCanvas from "./GameCanvas";

type HidePhaseProps = {
  onComplete: (recording: ReplayRecording) => void;
  onRestart: () => void;
};

const MOVEMENT_KEYS: Record<string, keyof InputState> = {
  w: "up",
  ArrowUp: "up",
  s: "down",
  ArrowDown: "down",
  a: "left",
  ArrowLeft: "left",
  d: "right",
  ArrowRight: "right",
};

const INITIAL_INPUT: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
};

export default function HidePhase({ onComplete, onRestart }: HidePhaseProps) {
  const [renderState, setRenderState] = useState<GameState>(() => createInitialGame());
  const [countdownRemaining, setCountdownRemaining] = useState(COUNTDOWN_SECONDS);
  const [debugOverlay, setDebugOverlay] = useState(false);
  const simRef = useRef<GameState>(renderState);
  const inputRef = useRef<InputState>({ ...INITIAL_INPUT });
  const snapshotsRef = useRef<ReplaySnapshot[]>([createSnapshot(renderState)]);
  const lastFrameRef = useRef<number | null>(null);
  const countdownStartedAtRef = useRef<number | null>(null);
  const roundStartedRef = useRef(false);
  const nextSnapshotAtRef = useRef(SNAPSHOT_INTERVAL);
  const finishedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    function setKey(event: KeyboardEvent, isDown: boolean) {
      if (event.key.toLowerCase() === "x" && isDown && !event.repeat) {
        event.preventDefault();
        setDebugOverlay((value) => !value);
        return;
      }

      const mapped = MOVEMENT_KEYS[event.key] ?? MOVEMENT_KEYS[event.key.toLowerCase()];
      if (!mapped) {
        return;
      }

      event.preventDefault();
      inputRef.current[mapped] = isDown;
    }

    const handleKeyDown = (event: KeyboardEvent) => setKey(event, true);
    const handleKeyUp = (event: KeyboardEvent) => setKey(event, false);

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    let frameId = 0;

    function tick(now: number) {
      const state = simRef.current;

      if (!roundStartedRef.current) {
        if (countdownStartedAtRef.current == null) {
          countdownStartedAtRef.current = now;
        }

        const elapsed = (now - countdownStartedAtRef.current) / 1000;
        const remaining = Math.max(0, COUNTDOWN_SECONDS - elapsed);
        setCountdownRemaining(remaining);

        if (remaining > 0) {
          frameId = window.requestAnimationFrame(tick);
          return;
        }

        roundStartedRef.current = true;
        lastFrameRef.current = now;
        snapshotsRef.current = [createSnapshot(state)];
        nextSnapshotAtRef.current = SNAPSHOT_INTERVAL;
        frameId = window.requestAnimationFrame(tick);
        return;
      }

      if (lastFrameRef.current == null) {
        lastFrameRef.current = now;
      }

      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      stepSimulation(state, inputRef.current, dt);

      if (state.timeElapsed >= nextSnapshotAtRef.current || state.status !== "running") {
        snapshotsRef.current.push(createSnapshot(state));
        nextSnapshotAtRef.current += SNAPSHOT_INTERVAL;
      }

      setRenderState(cloneGameStateForRender(state));

      if (state.status !== "running" && !finishedRef.current) {
        finishedRef.current = true;
        onCompleteRef.current(createRecording(state, snapshotsRef.current));
        return;
      }

      frameId = window.requestAnimationFrame(tick);
    }

    frameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const human = useMemo(() => findHumanActor(renderState), [renderState]);
  const objectiveReady = renderState.humanCollected >= renderState.requiredItems;
  const countdownValue = Math.ceil(countdownRemaining);

  return (
    <main className="screen play-screen">
      <section className="game-stage">
        <div className="top-bar">
          {countdownRemaining > 0 ? <h2>Clanker {human.label} is yours</h2> : <span aria-hidden="true" />}
          <div className="stat-strip" aria-label="Round status">
            <span title="Time remaining">
              <Timer size={18} aria-hidden="true" />
              {formatTime(renderState.timeRemaining)}
            </span>
            <button className="stat-action" type="button" title="Restart hide phase" onClick={onRestart}>
              <RotateCcw size={18} aria-hidden="true" />
              Restart
            </button>
            <span title="Objective progress">
              <Flag size={18} aria-hidden="true" />
              {renderState.humanCollected}/{renderState.requiredItems}
            </span>
          </div>
        </div>

        <div className="canvas-shell canvas-shell--countdown">
          <GameCanvas
            mode="hide"
            state={renderState}
            debugOverlay={debugOverlay}
            showNumberBadges={countdownRemaining > 0}
          />
          {countdownRemaining > 0 && (
            <div className="countdown-overlay" aria-live="polite">
              <span>Get ready</span>
              <strong>{countdownValue}</strong>
            </div>
          )}
        </div>
      </section>

      <aside className="side-panel">
        <div className="side-section">
          <p className="panel-label">Objective</p>
          <strong>{objectiveReady ? "Points banked" : "Score 3 points"}</strong>
          <p>
            {objectiveReady
              ? "You have enough points. Keep blending until the clock runs out."
              : "Collect three blue items before time expires, then stay natural."}
          </p>
        </div>

        <div className="side-section">
          <p className="panel-label">Controls</p>
          <div className="key-grid" aria-label="Movement controls">
            <span>W</span>
            <span>A</span>
            <span>S</span>
            <span>D</span>
          </div>
          <p>Arrow keys work too.</p>
        </div>

        <div className="side-section">
          <p className="panel-label">Blend pressure</p>
          <ul className="quiet-list">
            <li>Direct routes are fast and suspicious.</li>
            <li>Pauses can help, until they look deliberate.</li>
            <li>Bots collect, wander, hover, and hesitate.</li>
          </ul>
        </div>
      </aside>
    </main>
  );
}

function formatTime(seconds: number): string {
  const clamped = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(clamped / 60);
  const remaining = clamped % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}
