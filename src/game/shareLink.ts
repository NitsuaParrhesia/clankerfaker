import { MAP_LAYER } from "./constants";
import type {
  ActorSnapshot,
  GameStatus,
  ItemSnapshot,
  ReplayRecording,
  ReplaySnapshot,
  RoundOutcome,
} from "./types";

const SHARE_HASH_PREFIX = "review=";
const SHARE_TOKEN_PREFIX = "gz.";
const SHARE_FORMAT_VERSION = 1;
const REPLAY_API_PATH = "/api/replays";
const STORED_REPLAY_ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/u;
const TIME_SCALE = 100;
const HEADING_SCALE = 1000;

type CompactReplay = {
  v: typeof SHARE_FORMAT_VERSION;
  d: number;
  h: string;
  r: number;
  o: [number, number, number, number, number, number];
  a: Array<[string, number]>;
  i: string[];
  s: CompactSnapshot[];
};

type CompactSnapshot = [
  timestamp: number,
  actors: CompactActor[],
  items: CompactItem[],
  humanCollected: number,
  objectiveReady: number,
  status: number,
];

type CompactActor = [x: number, y: number, heading: number, collected: number];
type CompactItem = [x: number, y: number, active: number];

export function hasReplayShareHash(hash: string): boolean {
  return normalizeHash(hash).startsWith(SHARE_HASH_PREFIX);
}

export async function createReplayShareUrl(recording: ReplayRecording, currentHref = window.location.href) {
  const token = await encodeReplayRecording(recording);
  const shareReference = (await storeReplayToken(token)) ?? token;
  const url = new URL(currentHref);
  url.hash = `${SHARE_HASH_PREFIX}${encodeURIComponent(shareReference)}`;
  return url.toString();
}

export async function decodeReplayShareUrl(currentHref = window.location.href): Promise<ReplayRecording | null> {
  const hash = normalizeHash(new URL(currentHref).hash);
  if (!hash.startsWith(SHARE_HASH_PREFIX)) {
    return null;
  }

  const shareReference = decodeURIComponent(hash.slice(SHARE_HASH_PREFIX.length));
  const token = shareReference.startsWith(SHARE_TOKEN_PREFIX)
    ? shareReference
    : await loadStoredReplayToken(shareReference);
  return decodeReplayRecording(token);
}

export function clearReplayShareHash(currentHref = window.location.href): string {
  const url = new URL(currentHref);
  url.hash = "";
  return url.toString();
}

async function encodeReplayRecording(recording: ReplayRecording): Promise<string> {
  const compact = compactRecording(recording);
  const json = JSON.stringify(compact);
  const compressed = await compressText(json);
  return `${SHARE_TOKEN_PREFIX}${bytesToBase64Url(compressed)}`;
}

async function storeReplayToken(token: string): Promise<string | null> {
  try {
    const response = await fetch(REPLAY_API_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
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
    s: recording.snapshots.map((snapshot) => compactSnapshot(snapshot)),
  };
}

function compactSnapshot(snapshot: ReplaySnapshot): CompactSnapshot {
  return [
    packTime(snapshot.timestamp),
    snapshot.actors.map((actor) => [
      Math.round(actor.x),
      Math.round(actor.y),
      packHeading(actor.heading),
      actor.collected,
    ]),
    snapshot.items.map((item) => [Math.round(item.x), Math.round(item.y), item.active ? 1 : 0]),
    snapshot.humanCollected,
    snapshot.objectiveReady ? 1 : 0,
    compactStatus(snapshot.status),
  ];
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

function expandRecording(compact: CompactReplay): ReplayRecording {
  return {
    snapshots: compact.s.map((snapshot) => expandSnapshot(snapshot, compact.a, compact.i)),
    duration: unpackTime(compact.d),
    humanActorId: compact.h,
    requiredItems: compact.r,
    outcome: expandOutcome(compact.o),
    map: MAP_LAYER,
  };
}

function expandSnapshot(
  snapshot: CompactSnapshot,
  actorIndex: CompactReplay["a"],
  itemIndex: CompactReplay["i"],
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
    })),
    items: snapshot[2].map<ItemSnapshot>((item, index) => ({
      id: itemIndex[index] ?? `item-${index + 1}`,
      x: item[0],
      y: item[1],
      active: item[2] === 1,
    })),
    humanCollected: snapshot[3],
    objectiveReady: snapshot[4] === 1,
    status: expandStatus(snapshot[5]),
  };
}

function expandOutcome(outcome: CompactReplay["o"]): RoundOutcome {
  return {
    humanWon: outcome[0] === 1,
    duration: unpackTime(outcome[1]),
    humanCollected: outcome[2],
    requiredItems: outcome[3],
    botCollections: outcome[4],
    reason: outcome[5] === 1 ? "scored" : "timeout",
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
