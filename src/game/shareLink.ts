import { MAP_LAYER, REQUIRED_ITEMS } from "./constants";
import { getLocalProfile, type LocalProfile } from "./profile";
import type {
  ActorSnapshot,
  AlarmSnapshot,
  GameStatus,
  ItemSnapshot,
  ReplayRecording,
  ReplaySnapshot,
  RoundTask,
  RoundOutcome,
  SweeperSnapshot,
  TaskStep,
} from "./types";

const SHARE_HASH_PREFIX = "review=";
const SHARE_TOKEN_PREFIX = "gz.";
const SHARE_FORMAT_VERSION = 1;
const REPLAY_API_PATH = "/api/replays";
const STORED_REPLAY_ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/u;
const TIME_SCALE = 100;
const HEADING_SCALE = 1000;
const PROGRESS_SCALE = 1000;

type CompactReplay = {
  v: typeof SHARE_FORMAT_VERSION;
  d: number;
  h: string;
  r: number;
  o: [number, number, number, number, number, number];
  a: Array<[string, number]>;
  i: string[];
  t?: RoundTask;
  s: CompactSnapshot[];
};

type CompactSnapshot = [
  timestamp: number,
  actors: CompactActor[],
  items: CompactItem[],
  humanCollected: number,
  objectiveReady: number,
  status: number,
  alarm?: CompactAlarm | 0,
  sweeper?: CompactSweeper | 0,
  completedTaskMask?: number,
  sweepers?: CompactSweeperWithId[],
];

type CompactActor = [
  x: number,
  y: number,
  heading: number,
  collected: number,
  stunned?: number,
  takedownProgress?: number,
  respawnProgress?: number,
];
type CompactItem = [x: number, y: number, active: number];
type CompactAlarm = [lightId: string, phase: number, progress: number];
type CompactSweeper = [x: number, y: number, heading: number];
type CompactSweeperWithId = [id: string, x: number, y: number, heading: number];

export type ReplayShare = {
  url: string;
  id: string | null;
  stored: boolean;
};

export type PooledReplay = {
  id: string;
  ownerProfileId: string | null;
  recording: ReplayRecording;
};

export type DecodedReplayShare = {
  id: string | null;
  recording: ReplayRecording;
};

export function hasReplayShareHash(hash: string): boolean {
  return normalizeHash(hash).startsWith(SHARE_HASH_PREFIX);
}

export async function createReplayShare(
  recording: ReplayRecording,
  currentHref = window.location.href,
): Promise<ReplayShare> {
  const token = await encodeReplayRecording(recording);
  const replayId = await storeReplayToken(token, getLocalProfile(), recording.humanActorId);
  const shareReference = replayId ?? token;
  const url = new URL(currentHref);
  url.hash = `${SHARE_HASH_PREFIX}${encodeURIComponent(shareReference)}`;
  return {
    url: url.toString(),
    id: replayId,
    stored: replayId != null,
  };
}

export async function createReplayShareUrl(recording: ReplayRecording, currentHref = window.location.href) {
  return (await createReplayShare(recording, currentHref)).url;
}

export async function decodeReplayShareUrl(currentHref = window.location.href): Promise<ReplayRecording | null> {
  return (await decodeReplayShare(currentHref))?.recording ?? null;
}

export async function decodeReplayShare(currentHref = window.location.href): Promise<DecodedReplayShare | null> {
  const hash = normalizeHash(new URL(currentHref).hash);
  if (!hash.startsWith(SHARE_HASH_PREFIX)) {
    return null;
  }

  const shareReference = decodeURIComponent(hash.slice(SHARE_HASH_PREFIX.length));
  const replayId = shareReference.startsWith(SHARE_TOKEN_PREFIX) ? null : shareReference;
  const token = shareReference.startsWith(SHARE_TOKEN_PREFIX)
    ? shareReference
    : await loadStoredReplayToken(shareReference);

  return {
    id: replayId && STORED_REPLAY_ID_PATTERN.test(replayId) ? replayId : null,
    recording: await decodeReplayRecording(token),
  };
}

export function clearReplayShareHash(currentHref = window.location.href): string {
  const url = new URL(currentHref);
  url.hash = "";
  return url.toString();
}

export async function loadPooledReplay(options: { excludeId?: string | null } = {}): Promise<PooledReplay> {
  const searchParams = new URLSearchParams();
  const profile = getLocalProfile();

  if (options.excludeId && STORED_REPLAY_ID_PATTERN.test(options.excludeId)) {
    searchParams.set("exclude", options.excludeId);
  }
  searchParams.set("viewer", profile.id);

  const response = await fetch(`${REPLAY_API_PATH}${searchParams.size > 0 ? `?${searchParams}` : ""}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(response.status === 404 ? "No queued replays are ready yet." : "Replay queue could not be loaded.");
  }

  let payload: { id?: unknown; token?: unknown; ownerProfileId?: unknown };

  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new Error("Replay queue could not be loaded.");
  }

  if (
    typeof payload.id !== "string" ||
    !STORED_REPLAY_ID_PATTERN.test(payload.id) ||
    typeof payload.token !== "string" ||
    !payload.token.startsWith(SHARE_TOKEN_PREFIX)
  ) {
    throw new Error("Queued replay payload is not valid.");
  }

  return {
    id: payload.id,
    ownerProfileId: typeof payload.ownerProfileId === "string" ? payload.ownerProfileId : null,
    recording: await decodeReplayRecording(payload.token),
  };
}

async function encodeReplayRecording(recording: ReplayRecording): Promise<string> {
  const compact = compactRecording(recording);
  const json = JSON.stringify(compact);
  const compressed = await compressText(json);
  return `${SHARE_TOKEN_PREFIX}${bytesToBase64Url(compressed)}`;
}

async function storeReplayToken(token: string, profile: LocalProfile, humanActorId: string): Promise<string | null> {
  try {
    const response = await fetch(REPLAY_API_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        profileId: profile.id,
        displayName: profile.displayName,
        humanActorId,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { id?: unknown };
    return typeof payload.id === "string" && STORED_REPLAY_ID_PATTERN.test(payload.id) ? payload.id : null;
  } catch {
    return null;
  }
}

async function loadStoredReplayToken(shareReference: string): Promise<string> {
  if (!STORED_REPLAY_ID_PATTERN.test(shareReference)) {
    throw new Error("Replay link is not valid.");
  }

  const response = await fetch(`${REPLAY_API_PATH}/${encodeURIComponent(shareReference)}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Stored replay could not be loaded.");
  }

  const payload = (await response.json()) as { token?: unknown };
  if (typeof payload.token !== "string" || !payload.token.startsWith(SHARE_TOKEN_PREFIX)) {
    throw new Error("Stored replay payload is not valid.");
  }

  return payload.token;
}

async function decodeReplayRecording(token: string): Promise<ReplayRecording> {
  if (!token.startsWith(SHARE_TOKEN_PREFIX)) {
    throw new Error("Unsupported replay link format.");
  }

  const bytes = base64UrlToBytes(token.slice(SHARE_TOKEN_PREFIX.length));
  const json = await decompressText(bytes);
  const compact = JSON.parse(json) as CompactReplay;

  if (compact.v !== SHARE_FORMAT_VERSION) {
    throw new Error("Unsupported replay link version.");
  }

  return expandRecording(compact);
}

function compactRecording(recording: ReplayRecording): CompactReplay {
  const actorIndex = recording.snapshots[0]?.actors.map<[string, number]>((actor) => [actor.id, actor.label]) ?? [];
  const itemIndex = recording.snapshots[0]?.items.map((item) => item.id) ?? [];

  return {
    v: SHARE_FORMAT_VERSION,
    d: packTime(recording.duration),
    h: recording.humanActorId,
    r: recording.requiredItems,
    o: compactOutcome(recording.outcome),
    a: actorIndex,
    i: itemIndex,
    t: compactTask(recording.task),
    s: recording.snapshots.map((snapshot) => compactSnapshot(snapshot, recording.task)),
  };
}

function compactSnapshot(snapshot: ReplaySnapshot, task: RoundTask): CompactSnapshot {
  return [
    packTime(snapshot.timestamp),
    snapshot.actors.map((actor) => compactActor(actor)),
    snapshot.items.map((item) => [Math.round(item.x), Math.round(item.y), item.active ? 1 : 0]),
    snapshot.humanCollected,
    snapshot.objectiveReady ? 1 : 0,
    compactStatus(snapshot.status),
    compactAlarm(snapshot.alarm),
    snapshot.sweeper ? compactSweeper(snapshot.sweeper) : 0,
    compactCompletedTaskMask(snapshot.completedTaskIds, task),
    snapshot.sweepers ? snapshot.sweepers.map((sweeper) => compactSweeperWithId(sweeper)) : undefined,
  ];
}

function compactActor(actor: ActorSnapshot): CompactActor {
  const compact: CompactActor = [
    Math.round(actor.x),
    Math.round(actor.y),
    packHeading(actor.heading),
    actor.collected,
  ];
  const takedownProgress = actor.takedownProgress ?? 0;
  const respawnProgress = actor.respawnProgress ?? 0;

  if (actor.stunned || takedownProgress > 0 || respawnProgress > 0) {
    compact[4] = actor.stunned ? 1 : 0;
  }

  if (takedownProgress > 0) {
    compact[5] = Math.round(takedownProgress * PROGRESS_SCALE);
  }

  if (respawnProgress > 0) {
    compact[6] = Math.round(respawnProgress * PROGRESS_SCALE);
  }

  return compact;
}

function compactOutcome(outcome: RoundOutcome): CompactReplay["o"] {
  return [
    outcome.humanWon ? 1 : 0,
    packTime(outcome.duration),
    outcome.humanCollected,
    outcome.requiredItems,
    outcome.botCollections,
    outcome.reason === "scored" ? 1 : 0,
  ];
}

function compactAlarm(alarm: AlarmSnapshot | null): CompactAlarm | 0 {
  if (!alarm) {
    return 0;
  }

  return [alarm.lightId, alarm.phase === "active" ? 1 : 0, Math.round(alarm.progress * PROGRESS_SCALE)];
}

function compactSweeper(sweeper: SweeperSnapshot): CompactSweeper {
  return [Math.round(sweeper.x), Math.round(sweeper.y), packHeading(sweeper.heading)];
}

function compactSweeperWithId(sweeper: SweeperSnapshot): CompactSweeperWithId {
  return [sweeper.id, Math.round(sweeper.x), Math.round(sweeper.y), packHeading(sweeper.heading)];
}

function expandRecording(compact: CompactReplay): ReplayRecording {
  const task = expandTask(compact.t, compact.r);

  return {
    snapshots: compact.s.map((snapshot) => expandSnapshot(snapshot, compact.a, compact.i, task)),
    duration: unpackTime(compact.d),
    humanActorId: compact.h,
    requiredItems: compact.r,
    task,
    outcome: expandOutcome(compact.o, task),
    map: MAP_LAYER,
  };
}

function expandSnapshot(
  snapshot: CompactSnapshot,
  actorIndex: CompactReplay["a"],
  itemIndex: CompactReplay["i"],
  task: RoundTask,
): ReplaySnapshot {
  return {
    timestamp: unpackTime(snapshot[0]),
    actors: snapshot[1].map<ActorSnapshot>((actor, index) => ({
      id: actorIndex[index]?.[0] ?? `actor-${index + 1}`,
      label: actorIndex[index]?.[1] ?? index + 1,
      x: actor[0],
      y: actor[1],
      heading: unpackHeading(actor[2]),
      collected: actor[3],
      stunned: actor[4] === 1,
      takedownProgress: typeof actor[5] === "number" ? clamp(actor[5] / PROGRESS_SCALE, 0, 1) : 0,
      respawnProgress: typeof actor[6] === "number" ? clamp(actor[6] / PROGRESS_SCALE, 0, 1) : 0,
    })),
    items: snapshot[2].map<ItemSnapshot>((item, index) => ({
      id: itemIndex[index] ?? `item-${index + 1}`,
      x: item[0],
      y: item[1],
      active: item[2] === 1,
    })),
    humanCollected: snapshot[3],
    objectiveReady: snapshot[4] === 1,
    completedTaskIds: expandCompletedTaskIds(snapshot[8], task, snapshot[3]),
    status: expandStatus(snapshot[5]),
    alarm: expandAlarm(snapshot[6]),
    sweeper: expandSweeper(snapshot[7]),
    sweepers: expandSweepers(snapshot[9], snapshot[7]),
  };
}

function expandOutcome(outcome: CompactReplay["o"], task: RoundTask): RoundOutcome {
  return {
    humanWon: outcome[0] === 1,
    duration: unpackTime(outcome[1]),
    humanCollected: outcome[2],
    requiredItems: outcome[3],
    botCollections: outcome[4],
    taskTitle: task.title,
    reason: outcome[5] === 1 ? "scored" : "timeout",
  };
}

function createFallbackTask(requiredItems: number): RoundTask {
  return {
    title: "Complete the task",
    description: "Collect three tokens and complete one public task before the clock runs out.",
    required: requiredItems || REQUIRED_ITEMS,
    steps: [
      {
        id: "collect-token",
        kind: "collect" as const,
        label: "Collect 3 tokens",
        description: "Pick up three visible tokens while blending in.",
      },
    ],
  };
}

function compactTask(task: RoundTask): RoundTask {
  return {
    title: task.title,
    description: task.description,
    required: task.required,
    steps: task.steps.map((step) => ({
      ...step,
      position: step.position ? { ...step.position } : undefined,
      rect: step.rect ? { ...step.rect } : undefined,
    })),
  };
}

function expandTask(task: unknown, requiredItems: number): RoundTask {
  if (!task || typeof task !== "object") {
    return createFallbackTask(requiredItems);
  }

  const candidate = task as Partial<RoundTask>;
  if (!Array.isArray(candidate.steps)) {
    return createFallbackTask(requiredItems);
  }

  const steps = candidate.steps.map(normalizeTaskStep).filter((step): step is TaskStep => Boolean(step));
  if (steps.length === 0) {
    return createFallbackTask(requiredItems);
  }

  return {
    title: typeof candidate.title === "string" && candidate.title.trim() ? candidate.title : "Complete the task",
    description:
      typeof candidate.description === "string" && candidate.description.trim()
        ? candidate.description
        : "Collect three tokens and complete one public task before the clock runs out.",
    required: Math.max(1, Math.min(steps.length, Math.round(Number(candidate.required) || requiredItems || steps.length))),
    steps,
  };
}

function normalizeTaskStep(step: unknown): TaskStep | null {
  if (!step || typeof step !== "object") {
    return null;
  }

  const candidate = step as Partial<TaskStep>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.label !== "string" ||
    typeof candidate.description !== "string" ||
    !["collect", "terminal", "alarm", "walkway"].includes(String(candidate.kind))
  ) {
    return null;
  }

  return {
    id: candidate.id,
    kind: candidate.kind as TaskStep["kind"],
    label: candidate.label,
    description: candidate.description,
    targetId: typeof candidate.targetId === "string" ? candidate.targetId : undefined,
    position: normalizeVector(candidate.position),
    radius: typeof candidate.radius === "number" ? candidate.radius : undefined,
    rect: normalizeRect(candidate.rect),
  };
}

function normalizeVector(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === "number" && typeof point.y === "number" ? { x: point.x, y: point.y } : undefined;
}

function normalizeRect(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const rect = value as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  return typeof rect.x === "number" &&
    typeof rect.y === "number" &&
    typeof rect.width === "number" &&
    typeof rect.height === "number"
    ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    : undefined;
}

function compactCompletedTaskMask(completedTaskIds: string[], task: RoundTask): number {
  return task.steps.reduce(
    (mask, step, index) => (completedTaskIds.includes(step.id) ? mask | (1 << index) : mask),
    0,
  );
}

function expandCompletedTaskIds(mask: unknown, task: RoundTask, fallbackCount: number): string[] {
  if (typeof mask === "number") {
    return task.steps.filter((_, index) => (mask & (1 << index)) !== 0).map((step) => step.id);
  }

  return task.steps.slice(0, Math.min(Math.max(0, fallbackCount), task.steps.length)).map((step) => step.id);
}

function expandAlarm(alarm: CompactSnapshot[6]): AlarmSnapshot | null {
  if (!Array.isArray(alarm)) {
    return null;
  }

  const [lightId, phase, progress] = alarm;
  if (
    typeof lightId !== "string" ||
    !MAP_LAYER.alarmLights.some((light) => light.id === lightId) ||
    typeof phase !== "number" ||
    typeof progress !== "number"
  ) {
    return null;
  }

  return {
    lightId: lightId as AlarmSnapshot["lightId"],
    phase: phase === 1 ? "active" : "warning",
    progress: clamp(progress / PROGRESS_SCALE, 0, 1),
  };
}

function expandSweeper(sweeper: CompactSnapshot[7]): SweeperSnapshot | null {
  if (!Array.isArray(sweeper)) {
    return null;
  }

  const [x, y, heading] = sweeper;
  if (typeof x !== "number" || typeof y !== "number" || typeof heading !== "number") {
    return null;
  }

  return {
    id: "security-sweeper",
    x,
    y,
    heading: unpackHeading(heading),
  };
}

function expandSweepers(
  sweepers: CompactSnapshot[9],
  fallbackSweeper: CompactSnapshot[7],
): SweeperSnapshot[] | undefined {
  if (Array.isArray(sweepers)) {
    const expanded = sweepers.map(expandSweeperWithId).filter((sweeper): sweeper is SweeperSnapshot => Boolean(sweeper));
    if (expanded.length > 0) {
      return expanded;
    }
  }

  const fallback = expandSweeper(fallbackSweeper);
  return fallback ? [fallback] : undefined;
}

function expandSweeperWithId(sweeper: unknown): SweeperSnapshot | null {
  if (!Array.isArray(sweeper)) {
    return null;
  }

  const [id, x, y, heading] = sweeper;
  if (typeof id !== "string" || typeof x !== "number" || typeof y !== "number" || typeof heading !== "number") {
    return null;
  }

  return {
    id,
    x,
    y,
    heading: unpackHeading(heading),
  };
}

async function compressText(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function decompressText(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function compactStatus(status: GameStatus): number {
  switch (status) {
    case "human-won":
      return 1;
    case "timeout":
      return 2;
    default:
      return 0;
  }
}

function expandStatus(status: number): GameStatus {
  switch (status) {
    case 1:
      return "human-won";
    case 2:
      return "timeout";
    default:
      return "running";
  }
}

function normalizeHash(hash: string): string {
  return hash.startsWith("#") ? hash.slice(1) : hash;
}

function packTime(value: number): number {
  return Math.round(value * TIME_SCALE);
}

function unpackTime(value: number): number {
  return value / TIME_SCALE;
}

function packHeading(value: number): number {
  return Math.round(value * HEADING_SCALE);
}

function unpackHeading(value: number): number {
  return value / HEADING_SCALE;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
