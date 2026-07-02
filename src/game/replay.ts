import type {
  Actor,
  ActorSnapshot,
  BotBrain,
  BotDebugSnapshot,
  GameState,
  ItemSnapshot,
  ReplayRecording,
  ReplaySnapshot,
  Vector,
} from "./types";

export function createSnapshot(state: GameState): ReplaySnapshot {
  return {
    timestamp: Number(state.timeElapsed.toFixed(3)),
    actors: state.actors.map<ActorSnapshot>((actor) => ({
      id: actor.id,
      label: actor.label,
      x: Number(actor.position.x.toFixed(2)),
      y: Number(actor.position.y.toFixed(2)),
      heading: Number(actor.heading.toFixed(4)),
      collected: actor.collected,
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
    status: state.status,
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
    outcome: {
      humanWon: state.status === "human-won",
      duration,
      humanCollected: state.humanCollected,
      requiredItems: state.requiredItems,
      botCollections: state.botCollections,
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

      return {
        ...actor,
        x: lerp(actor.x, next.x, t),
        y: lerp(actor.y, next.y, t),
        heading: lerpAngle(actor.heading, next.heading, t),
        collected: t > 0.5 ? next.collected : actor.collected,
        bot: cloneBotDebugSnapshot(t > 0.5 ? next.bot : actor.bot),
      };
    }),
    items: t < 0.5 ? before.items : after.items,
    humanCollected: t > 0.5 ? after.humanCollected : before.humanCollected,
    objectiveReady: t > 0.5 ? after.objectiveReady : before.objectiveReady,
    status: t > 0.5 ? after.status : before.status,
  };
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
