import { SWEEPER_RESPAWN_EFFECT_DURATION, SWEEPER_STUN_DURATION } from "./constants";
import type {
  Actor,
  ActorSnapshot,
  AlarmSnapshot,
  BotBrain,
  BotDebugSnapshot,
  GameState,
  ItemSnapshot,
  ReplayRecording,
  ReplaySnapshot,
  SweeperSnapshot,
  Vector,
} from "./types";

export function createSnapshot(state: GameState): ReplaySnapshot {
  const humanActor = state.actors.find((actor) => actor.id === state.humanActorId);

  return {
    timestamp: Number(state.timeElapsed.toFixed(3)),
    actors: state.actors.map<ActorSnapshot>((actor) => ({
      id: actor.id,
      label: actor.label,
      x: Number(actor.position.x.toFixed(2)),
      y: Number(actor.position.y.toFixed(2)),
      heading: Number(actor.heading.toFixed(4)),
      collected: actor.collected,
      stunned: state.timeElapsed < actor.stunnedUntil,
      takedownProgress: getTakedownProgress(state, actor),
      respawnProgress: getRespawnProgress(state, actor),
      bot: createBotDebugSnapshot(actor),
    })),
    items: state.items.map<ItemSnapshot>((item) => ({
      id: item.id,
      x: Number(item.position.x.toFixed(2)),
      y: Number(item.position.y.toFixed(2)),
      active: item.active,
    })),
    humanCollected: state.humanCollected,
    objectiveReady: state.humanCollected >= state.requiredItems,
    completedTaskIds: humanActor ? [...humanActor.completedTaskIds] : [],
    status: state.status,
    alarm: createAlarmSnapshot(state),
    sweeper: createSweeperSnapshot(state.sweeper),
    sweepers: createSweeperSnapshots(state),
  };
}

export function createRecording(state: GameState, snapshots: ReplaySnapshot[]): ReplayRecording {
  const normalizedSnapshots = normalizeSnapshots(state, snapshots);
  const duration = normalizedSnapshots[normalizedSnapshots.length - 1]?.timestamp ?? state.timeElapsed;

  return {
    snapshots: normalizedSnapshots,
    duration,
    humanActorId: state.humanActorId,
    requiredItems: state.requiredItems,
    task: state.task,
    outcome: {
      humanWon: state.status === "human-won",
      duration,
      humanCollected: state.humanCollected,
      requiredItems: state.requiredItems,
      botCollections: state.botCollections,
      taskTitle: state.task.title,
      reason: state.status === "human-won" ? "scored" : "timeout",
    },
    map: state.mapLayer,
  };
}

export function getReplayFrame(recording: ReplayRecording, time: number): ReplaySnapshot {
  if (recording.snapshots.length === 0) {
    throw new Error("Cannot play an empty replay.");
  }

  const clampedTime = Math.max(0, Math.min(recording.duration, time));
  const snapshots = recording.snapshots;

  if (clampedTime <= snapshots[0].timestamp) {
    return snapshots[0];
  }

  const last = snapshots[snapshots.length - 1];
  if (clampedTime >= last.timestamp) {
    return last;
  }

  let left = 0;
  let right = snapshots.length - 1;

  while (left <= right) {
    const midpoint = Math.floor((left + right) / 2);
    if (snapshots[midpoint].timestamp < clampedTime) {
      left = midpoint + 1;
    } else {
      right = midpoint - 1;
    }
  }

  const after = snapshots[left];
  const before = snapshots[left - 1];
  const span = Math.max(0.001, after.timestamp - before.timestamp);
  const t = (clampedTime - before.timestamp) / span;

  return {
    timestamp: clampedTime,
    actors: before.actors.map((actor) => {
      const next = after.actors.find((candidate) => candidate.id === actor.id);
      if (!next) {
        return actor;
      }

      const jumpDistance = Math.hypot(next.x - actor.x, next.y - actor.y);
      const takedownProgress = lerp(actor.takedownProgress ?? 0, next.takedownProgress ?? 0, t);
      const respawnProgress = lerp(actor.respawnProgress ?? 0, next.respawnProgress ?? 0, t);
      const isRespawnJump =
        jumpDistance > 90 &&
        (actor.stunned ||
          next.stunned ||
          (actor.takedownProgress ?? 0) > 0 ||
          (next.takedownProgress ?? 0) > 0 ||
          (next.respawnProgress ?? 0) > 0);

      if (isRespawnJump) {
        const source = t > 0.5 ? next : actor;
        return {
          ...source,
          bot: cloneBotDebugSnapshot(source.bot),
        };
      }

      return {
        ...actor,
        x: lerp(actor.x, next.x, t),
        y: lerp(actor.y, next.y, t),
        heading: lerpAngle(actor.heading, next.heading, t),
        collected: t > 0.5 ? next.collected : actor.collected,
        stunned: t > 0.5 ? next.stunned : actor.stunned,
        takedownProgress,
        respawnProgress,
        bot: cloneBotDebugSnapshot(t > 0.5 ? next.bot : actor.bot),
      };
    }),
    items: t < 0.5 ? before.items : after.items,
    humanCollected: t > 0.5 ? after.humanCollected : before.humanCollected,
    objectiveReady: t > 0.5 ? after.objectiveReady : before.objectiveReady,
    completedTaskIds: t > 0.5 ? after.completedTaskIds : before.completedTaskIds,
    status: t > 0.5 ? after.status : before.status,
    alarm: interpolateAlarmSnapshot(before.alarm, after.alarm, t),
    sweeper: interpolateSweeperSnapshot(before.sweeper, after.sweeper, t),
    sweepers: interpolateSweeperSnapshots(before.sweepers, after.sweepers, t),
  };
}

function getTakedownProgress(state: GameState, actor: Actor): number {
  if (actor.respawnAt <= state.timeElapsed || actor.respawnAt <= 0) {
    return 0;
  }

  const startedAt = actor.respawnAt - SWEEPER_STUN_DURATION;
  return Number(clamp((state.timeElapsed - startedAt) / SWEEPER_STUN_DURATION, 0, 1).toFixed(3));
}

function getRespawnProgress(state: GameState, actor: Actor): number {
  if (actor.respawnEffectUntil <= state.timeElapsed || actor.respawnEffectUntil <= 0) {
    return 0;
  }

  const startedAt = actor.respawnEffectUntil - SWEEPER_RESPAWN_EFFECT_DURATION;
  return Number(clamp((state.timeElapsed - startedAt) / SWEEPER_RESPAWN_EFFECT_DURATION, 0, 1).toFixed(3));
}

export function createAlarmSnapshot(state: GameState): AlarmSnapshot | null {
  const { alarm } = state;

  if (alarm.phase === "warning") {
    return {
      lightId: alarm.lightId,
      phase: alarm.phase,
      progress: clamp((state.timeElapsed - alarm.warningAt) / Math.max(0.001, alarm.activeAt - alarm.warningAt), 0, 1),
    };
  }

  if (alarm.phase === "active") {
    return {
      lightId: alarm.lightId,
      phase: alarm.phase,
      progress: clamp((state.timeElapsed - alarm.activeAt) / Math.max(0.001, alarm.endsAt - alarm.activeAt), 0, 1),
    };
  }

  return null;
}

export function createSweeperSnapshots(state: GameState): SweeperSnapshot[] {
  return state.sweepers.map((sweeper) => createSweeperSnapshot(sweeper));
}

export function createSweeperSnapshot(sweeper: GameState["sweeper"]): SweeperSnapshot {
  return {
    id: sweeper.id,
    x: Number(sweeper.position.x.toFixed(2)),
    y: Number(sweeper.position.y.toFixed(2)),
    heading: Number(sweeper.heading.toFixed(4)),
  };
}

function interpolateAlarmSnapshot(
  before: AlarmSnapshot | null,
  after: AlarmSnapshot | null,
  t: number,
): AlarmSnapshot | null {
  if (before && after && before.lightId === after.lightId && before.phase === after.phase) {
    return {
      ...before,
      progress: lerp(before.progress, after.progress, t),
    };
  }

  return t > 0.5 ? after : before;
}

function interpolateSweeperSnapshot(
  before: SweeperSnapshot | null,
  after: SweeperSnapshot | null,
  t: number,
): SweeperSnapshot | null {
  if (!before || !after || before.id !== after.id) {
    return t > 0.5 ? after : before;
  }

  return {
    id: before.id,
    x: lerp(before.x, after.x, t),
    y: lerp(before.y, after.y, t),
    heading: lerpAngle(before.heading, after.heading, t),
  };
}

function interpolateSweeperSnapshots(
  before: SweeperSnapshot[] | undefined,
  after: SweeperSnapshot[] | undefined,
  t: number,
): SweeperSnapshot[] | undefined {
  if (!before && !after) {
    return undefined;
  }

  const beforeList = before ?? [];
  const afterList = after ?? [];
  const ids = new Set([...beforeList.map((sweeper) => sweeper.id), ...afterList.map((sweeper) => sweeper.id)]);

  return [...ids].map((id) => {
    const beforeSweeper = beforeList.find((sweeper) => sweeper.id === id) ?? null;
    const afterSweeper = afterList.find((sweeper) => sweeper.id === id) ?? null;
    return interpolateSweeperSnapshot(beforeSweeper, afterSweeper, t) ?? beforeSweeper ?? afterSweeper;
  }).filter((sweeper): sweeper is SweeperSnapshot => Boolean(sweeper));
}

export function createBotDebugSnapshot(actor: Actor): BotDebugSnapshot | undefined {
  if (!actor.bot) {
    return undefined;
  }

  return snapshotBotBrain(actor.bot);
}

function snapshotBotBrain(bot: BotBrain): BotDebugSnapshot {
  return {
    personality: bot.personality,
    targetKind: bot.targetKind,
    state: getBotState(bot),
    target: { ...bot.target },
    finalTarget: { ...bot.finalTarget },
    targetTaskId: bot.targetTaskId,
    path: bot.path.map((point) => ({ ...point })),
    pathIndex: bot.pathIndex,
    targetZone: bot.targetZone,
    homeZone: bot.homeZone,
    roamZone: bot.roamZone,
    pointQuota: bot.pointQuota,
    pauseTimer: Number(bot.pauseTimer.toFixed(2)),
    retargetTimer: Number(bot.retargetTimer.toFixed(2)),
    stuckTimer: Number(bot.stuckTimer.toFixed(2)),
    unstickCooldown: Number(bot.unstickCooldown.toFixed(2)),
  };
}

function cloneBotDebugSnapshot(snapshot?: BotDebugSnapshot): BotDebugSnapshot | undefined {
  if (!snapshot) {
    return undefined;
  }

  return {
    ...snapshot,
    target: { ...snapshot.target },
    finalTarget: { ...snapshot.finalTarget },
    path: snapshot.path.map((point) => ({ ...point })),
  };
}

function getBotState(bot: BotBrain): BotDebugSnapshot["state"] {
  if (bot.pauseTimer > 0) {
    return "paused";
  }

  if (bot.unstickCooldown > 0 || bot.stuckTimer > 0.25) {
    return "unsticking";
  }

  if (bot.pathIndex < bot.path.length - 1) {
    return "pathing";
  }

  return "seeking";
}

export function findSnapshotActor(frame: ReplaySnapshot, actorId: string) {
  return frame.actors.find((actor) => actor.id === actorId);
}

export function getActorTrail(
  recording: ReplayRecording,
  actorId: string,
  time: number,
  maxPoints = 160,
): Vector[] {
  const clampedTime = Math.max(0, Math.min(recording.duration, time));
  const points: Vector[] = [];

  for (const snapshot of recording.snapshots) {
    if (snapshot.timestamp > clampedTime) {
      break;
    }

    const actor = findSnapshotActor(snapshot, actorId);
    if (actor) {
      points.push({ x: actor.x, y: actor.y });
    }
  }

  const currentActor = findSnapshotActor(getReplayFrame(recording, clampedTime), actorId);
  const lastPoint = points[points.length - 1];
  if (
    currentActor &&
    (!lastPoint || Math.hypot(currentActor.x - lastPoint.x, currentActor.y - lastPoint.y) > 0.5)
  ) {
    points.push({ x: currentActor.x, y: currentActor.y });
  }

  return points.slice(-maxPoints);
}

function normalizeSnapshots(state: GameState, snapshots: ReplaySnapshot[]): ReplaySnapshot[] {
  const finalSnapshot = createSnapshot(state);
  const allSnapshots = snapshots.length > 0 ? [...snapshots] : [finalSnapshot];
  const last = allSnapshots[allSnapshots.length - 1];

  if (!last || Math.abs(last.timestamp - finalSnapshot.timestamp) > 0.001) {
    allSnapshots.push(finalSnapshot);
  } else {
    allSnapshots[allSnapshots.length - 1] = finalSnapshot;
  }

  return allSnapshots;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  return normalizeAngle(a + normalizeAngle(b - a) * t);
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
