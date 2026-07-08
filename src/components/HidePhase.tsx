import { Flag, Play, RotateCcw, Timer } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { COUNTDOWN_SECONDS, REQUIRED_ITEMS, SNAPSHOT_INTERVAL } from "../game/constants";
import { createRecording, createSnapshot } from "../game/replay";
import {
  cloneGameStateForRender,
  createInitialGame,
  findHumanActor,
  stepSimulation,
} from "../game/simulation";
import type { GameState, InputState, ReplayRecording, ReplaySnapshot, TaskStepKind } from "../game/types";
import GameCanvas from "./GameCanvas";

type HidePhaseProps = {
  onComplete: (recording: ReplayRecording) => void;
  onRestart: () => void;
};

type MovementInputKey = "up" | "down" | "left" | "right";

const MOVEMENT_KEYS: Record<string, MovementInputKey> = {
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
  moveX: 0,
  moveY: 0,
};

const JOYSTICK_RADIUS = 34;
const JOYSTICK_DEAD_ZONE = 0.12;

export default function HidePhase({ onComplete, onRestart }: HidePhaseProps) {
  const [renderState, setRenderState] = useState<GameState>(() => createInitialGame());
  const [countdownRemaining, setCountdownRemaining] = useState(COUNTDOWN_SECONDS);
  const [objectiveBriefOpen, setObjectiveBriefOpen] = useState(true);
  const [debugOverlay, setDebugOverlay] = useState(false);
  const [joystick, setJoystick] = useState({ x: 0, y: 0, active: false });
  const simRef = useRef<GameState>(renderState);
  const inputRef = useRef<InputState>({ ...INITIAL_INPUT });
  const snapshotsRef = useRef<ReplaySnapshot[]>([createSnapshot(renderState)]);
  const lastFrameRef = useRef<number | null>(null);
  const countdownStartedAtRef = useRef<number | null>(null);
  const countdownArmedRef = useRef(false);
  const roundStartedRef = useRef(false);
  const nextSnapshotAtRef = useRef(SNAPSHOT_INTERVAL);
  const finishedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const joystickActiveRef = useRef(false);

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

      if (!countdownArmedRef.current) {
        frameId = window.requestAnimationFrame(tick);
        return;
      }

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
  const completedTaskIds = useMemo(() => new Set(human.completedTaskIds), [human.completedTaskIds]);
  const countdownValue = Math.ceil(countdownRemaining);
  const countdownActive = !objectiveBriefOpen && countdownRemaining > 0;
  const roundStarted = !objectiveBriefOpen && countdownRemaining <= 0;

  function handleStartCountdown() {
    countdownArmedRef.current = true;
    countdownStartedAtRef.current = null;
    setCountdownRemaining(COUNTDOWN_SECONDS);
    setObjectiveBriefOpen(false);
  }

  function updateJoystickInput(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const distance = Math.hypot(rawX, rawY);
    const limitedDistance = Math.min(distance, JOYSTICK_RADIUS);
    const normal = distance > 0 ? { x: rawX / distance, y: rawY / distance } : { x: 0, y: 0 };
    const inputX = normal.x * (limitedDistance / JOYSTICK_RADIUS);
    const inputY = normal.y * (limitedDistance / JOYSTICK_RADIUS);
    const adjustedInput = {
      x: Math.abs(inputX) < JOYSTICK_DEAD_ZONE ? 0 : inputX,
      y: Math.abs(inputY) < JOYSTICK_DEAD_ZONE ? 0 : inputY,
    };

    inputRef.current.moveX = adjustedInput.x;
    inputRef.current.moveY = adjustedInput.y;
    setJoystick({
      x: normal.x * limitedDistance,
      y: normal.y * limitedDistance,
      active: true,
    });
  }

  function handleJoystickPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    joystickActiveRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystickInput(event);
  }

  function handleJoystickPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!joystickActiveRef.current) {
      return;
    }

    updateJoystickInput(event);
  }

  function resetJoystick(event?: ReactPointerEvent<HTMLDivElement>) {
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    inputRef.current.moveX = 0;
    inputRef.current.moveY = 0;
    joystickActiveRef.current = false;
    setJoystick({ x: 0, y: 0, active: false });
  }

  return (
    <main className="screen play-screen play-screen--hide">
      <section className="game-stage">
        <div className="top-bar">
          {!roundStarted ? <h2>Clanker {human.label} is yours</h2> : <span aria-hidden="true" />}
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
            showNumberBadges={!roundStarted}
            countdownHighlightActorId={!roundStarted ? human.id : null}
          />
          {objectiveBriefOpen && (
            <ObjectiveBriefModal actorLabel={human.label} state={renderState} onStart={handleStartCountdown} />
          )}
          {countdownActive && (
            <div className="countdown-overlay" aria-live="polite">
              <span>Get ready</span>
              <strong>{countdownValue}</strong>
            </div>
          )}
        </div>

        <div className="mobile-hide-controls" aria-label="Touch movement controls">
          <div
            className={`virtual-joystick ${joystick.active ? "is-active" : ""}`}
            role="application"
            aria-label="Move clanker"
            onPointerDown={handleJoystickPointerDown}
            onPointerMove={handleJoystickPointerMove}
            onPointerUp={resetJoystick}
            onPointerCancel={resetJoystick}
            onLostPointerCapture={() => resetJoystick()}
          >
            <span
              className="virtual-joystick__thumb"
              style={{ transform: `translate(${joystick.x}px, ${joystick.y}px)` }}
            />
          </div>

          <div className="mobile-hud" aria-label="Round status">
            <span title="Time remaining">
              <Timer size={17} aria-hidden="true" />
              {formatTime(renderState.timeRemaining)}
            </span>
            <span title="Objective progress">
              <Flag size={17} aria-hidden="true" />
              {renderState.humanCollected}/{renderState.requiredItems}
            </span>
            <button className="stat-action" type="button" title="Restart hide phase" onClick={onRestart}>
              <RotateCcw size={17} aria-hidden="true" />
              Restart
            </button>
          </div>
        </div>
      </section>

      <aside className="side-panel">
          <div className="side-section">
          <p className="panel-label">Objective</p>
          <strong>{objectiveReady ? "Task complete" : "Complete the task"}</strong>
          <p>
            {objectiveReady
              ? "You finished the public task. Keep blending until the clock runs out."
              : "Collect three tokens, finish one public task, and avoid moving too perfectly."}
          </p>
          <ol className="task-step-list" aria-label="Task checklist">
            {renderState.task.steps.map((step) => {
              const isComplete = completedTaskIds.has(step.id);
              const isHolding = human.taskHoldStepId === step.id && !isComplete;
              return (
                <li
                  className={`task-step-list__item ${isComplete ? "is-complete" : ""} ${isHolding ? "is-holding" : ""}`}
                  key={step.id}
                >
                  <span className="task-step-list__status" aria-hidden="true">
                    {isComplete ? "OK" : isHolding ? "..." : ""}
                  </span>
                  <span>
                    <strong>{step.label}</strong>
                    <small>{isComplete ? "Done" : getTaskStepHint(step.kind, human.collected)}</small>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="side-section">
          <p className="panel-label">Controls</p>
          <div className="key-grid" aria-label="Movement controls">
            <span>W</span>
            <span>A</span>
            <span>S</span>
            <span>D</span>
          </div>
          <p>
            {roundStarted
              ? "Use WASD, arrow keys, or the mobile joystick."
              : "Read the objective, then start the countdown when you are ready."}
          </p>
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

function ObjectiveBriefModal({
  actorLabel,
  state,
  onStart,
}: {
  actorLabel: number;
  state: GameState;
  onStart: () => void;
}) {
  return (
    <div className="objective-brief-overlay" role="presentation">
      <section className="objective-brief" role="dialog" aria-modal="true" aria-labelledby="objective-brief-title">
        <p className="eyebrow">Your objective</p>
        <h1 id="objective-brief-title">Clanker {actorLabel}, complete the task.</h1>
        <p>
          Collect three tokens and complete one public task before the clock runs out.
        </p>

        <ol className="objective-brief__tasks" aria-label="Round objectives">
          {state.task.steps.map((step) => (
            <li key={step.id}>
              <strong>{step.label}</strong>
              <span>{getObjectiveBriefHint(step.kind)}</span>
            </li>
          ))}
        </ol>

        <button className="primary-button objective-brief__start" type="button" onClick={onStart}>
          <Play size={20} aria-hidden="true" />
          Start Countdown
        </button>
      </section>
    </div>
  );
}

function formatTime(seconds: number): string {
  const clamped = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(clamped / 60);
  const remaining = clamped % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function getTaskStepHint(kind: TaskStepKind, collectedPoints: number): string {
  switch (kind) {
    case "collect":
      return `${Math.min(collectedPoints, REQUIRED_ITEMS)}/${REQUIRED_ITEMS} tokens`;
    case "terminal":
      return "Pause at the console";
    case "alarm":
      return "Stand in the marked area";
    case "walkway":
      return "Ride the marked belt";
    default:
      return "In progress";
  }
}

function getObjectiveBriefHint(kind: TaskStepKind): string {
  switch (kind) {
    case "collect":
      return "Required";
    case "terminal":
      return "Pause there";
    case "alarm":
      return "Stand there";
    case "walkway":
      return "Ride it";
    default:
      return "Required";
  }
}
