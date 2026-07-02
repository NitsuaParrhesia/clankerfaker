import {
  ACTOR_RADIUS,
  BOT_BASE_SPEED,
  GAME_HEIGHT,
  GAME_WIDTH,
} from "./constants";
import type { Actor, BotPersonality, BotTargetKind, GameState, MapZoneId, Rect, Vector } from "./types";

type PersonalityProfile = {
  speedMultiplier: number;
  pauseChance: number;
  minPause: number;
  maxPause: number;
  retargetMin: number;
  retargetMax: number;
  jitter: number;
  itemWeight: number;
  exitWeight: number;
  actorWeight: number;
  decorWeight: number;
  loopWeight: number;
};

const SIDE_ROOM_ZONES: MapZoneId[] = [
  "upperLeftLounge",
  "upperRightLab",
  "lowerLeftOffice",
  "lowerRightStorage",
];

const BOT_HOME_ZONE_SEQUENCE: MapZoneId[] = [
  "upperLeftLounge",
  "upperRightLab",
  "lowerLeftOffice",
  "lowerRightStorage",
  "mainFloor",
  "upperLeftLounge",
  "upperRightLab",
  "mainFloor",
  "lowerLeftOffice",
  "lowerRightStorage",
];

const BOT_POINT_QUOTA = 3;

const BOT_AVOID_TARGET_RECTS: Rect[] = [
  { x: 318, y: 96, width: 132, height: 222 },
];

export const PERSONALITY_PROFILES: Record<BotPersonality, PersonalityProfile> = {
  Wanderer: {
    speedMultiplier: 0.92,
    pauseChance: 0.18,
    minPause: 0.25,
    maxPause: 1.3,
    retargetMin: 1.2,
    retargetMax: 3.2,
    jitter: 0.42,
    itemWeight: 0.14,
    exitWeight: 0.01,
    actorWeight: 0.08,
    decorWeight: 0.26,
    loopWeight: 0.04,
  },
  "Task-focused": {
    speedMultiplier: 1.03,
    pauseChance: 0.08,
    minPause: 0.12,
    maxPause: 0.7,
    retargetMin: 1.8,
    retargetMax: 4.1,
    jitter: 0.16,
    itemWeight: 0.38,
    exitWeight: 0.01,
    actorWeight: 0.04,
    decorWeight: 0.12,
    loopWeight: 0.02,
  },
  Hesitant: {
    speedMultiplier: 0.82,
    pauseChance: 0.34,
    minPause: 0.45,
    maxPause: 1.9,
    retargetMin: 0.9,
    retargetMax: 2.3,
    jitter: 0.3,
    itemWeight: 0.18,
    exitWeight: 0.01,
    actorWeight: 0.06,
    decorWeight: 0.22,
    loopWeight: 0.03,
  },
  Curious: {
    speedMultiplier: 0.96,
    pauseChance: 0.14,
    minPause: 0.15,
    maxPause: 1.0,
    retargetMin: 1.0,
    retargetMax: 2.8,
    jitter: 0.36,
    itemWeight: 0.14,
    exitWeight: 0.01,
    actorWeight: 0.22,
    decorWeight: 0.28,
    loopWeight: 0.04,
  },
  Looper: {
    speedMultiplier: 0.94,
    pauseChance: 0.12,
    minPause: 0.18,
    maxPause: 0.95,
    retargetMin: 1.8,
    retargetMax: 4.0,
    jitter: 0.18,
    itemWeight: 0.14,
    exitWeight: 0.01,
    actorWeight: 0.03,
    decorWeight: 0.16,
    loopWeight: 0.34,
  },
  Efficient: {
    speedMultiplier: 1.12,
    pauseChance: 0.06,
    minPause: 0.08,
    maxPause: 0.45,
    retargetMin: 2.3,
    retargetMax: 4.8,
    jitter: 0.1,
    itemWeight: 0.34,
    exitWeight: 0.01,
    actorWeight: 0.02,
    decorWeight: 0.1,
    loopWeight: 0.02,
  },
  Distracted: {
    speedMultiplier: 0.98,
    pauseChance: 0.2,
    minPause: 0.12,
    maxPause: 1.1,
    retargetMin: 0.55,
    retargetMax: 1.7,
    jitter: 0.5,
    itemWeight: 0.16,
    exitWeight: 0.01,
    actorWeight: 0.14,
    decorWeight: 0.28,
    loopWeight: 0.03,
  },
};

export const PERSONALITY_ORDER: BotPersonality[] = [
  "Wanderer",
  "Task-focused",
  "Hesitant",
  "Curious",
  "Looper",
  "Efficient",
  "Distracted",
];

export function configureBotSpeed(personality: BotPersonality, rng: () => number): number {
  const profile = PERSONALITY_PROFILES[personality];
  return BOT_BASE_SPEED * profile.speedMultiplier * (0.93 + rng() * 0.14);
}

export function pickBotHomeZone(botIndex: number): MapZoneId {
  return BOT_HOME_ZONE_SEQUENCE[botIndex % BOT_HOME_ZONE_SEQUENCE.length];
}

export function configureBotPointQuota(botIndex: number, rng: () => number): number {
  void botIndex;
  void rng;
  return BOT_POINT_QUOTA;
}

export function maybePauseBot(actor: Actor, rng: () => number): void {
  if (!actor.bot) {
    return;
  }

  const profile = PERSONALITY_PROFILES[actor.bot.personality];
  if (rng() < profile.pauseChance) {
    actor.bot.pauseTimer = lerp(profile.minPause, profile.maxPause, rng());
  }
}

export function chooseBotTarget(
  actor: Actor,
  state: GameState,
  rng: () => number,
): { target: Vector; kind: BotTargetKind; targetActorId?: string; targetZone?: MapZoneId } {
  const bot = actor.bot;
  if (!bot) {
    const target = randomOpenPoint(state, rng);
    return { target, kind: "wander", targetZone: getMapZoneForPoint(target, state) };
  }

  const profile = PERSONALITY_PROFILES[bot.personality];
  const preferredZone = chooseCommittedRoamZone(actor, state, rng);
  const pointPressure = getPointQuotaPressure(actor, state);
  if (pointPressure > 0 && rng() < pointPressure) {
    const item = findAppealingItem(actor, state, rng, preferredZone, true);
    if (item) {
      return {
        target: item.position,
        kind: "item",
        targetZone: getMapZoneForPoint(item.position, state),
      };
    }
  }

  const choice = weightedChoice(
    [
      ["item", profile.itemWeight],
      ["exit", profile.exitWeight],
      ["actor", profile.actorWeight],
      ["decor", profile.decorWeight],
      ["loop", profile.loopWeight],
      ["wander", 1],
    ],
    rng,
  );

  if (choice === "item") {
    const item = findAppealingItem(actor, state, rng, preferredZone, actor.collected < bot.pointQuota);
    if (item) {
      return {
        target: item.position,
        kind: "item",
        targetZone: getMapZoneForPoint(item.position, state),
      };
    }
  }

  if (choice === "exit") {
    const target = {
      x: state.exit.x + state.exit.width * (0.35 + rng() * 0.3),
      y: state.exit.y + state.exit.height * (0.2 + rng() * 0.6),
    };
    return {
      target,
      kind: "exit",
      targetZone: getMapZoneForPoint(target, state),
    };
  }

  if (choice === "actor") {
    const other = randomNearbyActor(actor, state, rng);
    if (other) {
      const target = randomOpenPointNear(other.position, state, rng, 62, preferredZone);
      return {
        target,
        kind: "actor",
        targetActorId: other.id,
        targetZone: getMapZoneForPoint(target, state),
      };
    }
  }

  if (choice === "decor" && state.decor.length > 0) {
    const decor = findDecorInZone(state, rng, preferredZone);
    const target = randomOpenPointNear(decor.position, state, rng, decor.radius + 42, preferredZone);
    return {
      target,
      kind: "decor",
      targetZone: getMapZoneForPoint(target, state),
    };
  }

  if (choice === "loop" && bot.loopPoints.length > 0) {
    bot.loopIndex = (bot.loopIndex + 1) % bot.loopPoints.length;
    const loopPoint = bot.loopPoints[bot.loopIndex];
    const target = getMapZoneForPoint(loopPoint, state) === preferredZone
      ? loopPoint
      : randomOpenPoint(state, rng, preferredZone);
    return {
      target,
      kind: "loop",
      targetZone: getMapZoneForPoint(target, state),
    };
  }

  const target = randomOpenPoint(state, rng, preferredZone);
  return { target, kind: "wander", targetZone: getMapZoneForPoint(target, state) };
}

export function nextRetargetDelay(personality: BotPersonality, rng: () => number): number {
  const profile = PERSONALITY_PROFILES[personality];
  return lerp(profile.retargetMin, profile.retargetMax, rng());
}

export function botJitter(personality: BotPersonality): number {
  return PERSONALITY_PROFILES[personality].jitter;
}

export function randomOpenPoint(
  state: GameState,
  rng: () => number,
  preferredZone?: MapZoneId,
): Vector {
  const zone = preferredZone ? getZone(preferredZone, state) : pickRoamZone(state, rng);
  const avoidWalkways = zone?.id !== "walkwayLane";

  if (zone) {
    for (let attempt = 0; attempt < 70; attempt += 1) {
      const point = randomPointInRect(zone.bounds, rng);

      if (
        isOpenPoint(point, state) &&
        !isPointInAvoidTargetRect(point) &&
        (!avoidWalkways || !isPointOnMovingWalkway(point, state))
      ) {
        return point;
      }
    }
  }

  const roamNodes = state.mapLayer.botNavigationNodes.filter(
    (node) => node.kind !== "walkway" && (!preferredZone || node.zone === preferredZone),
  );
  if (roamNodes.length > 0 && rng() < 0.45) {
    const waypoint = roamNodes[Math.floor(rng() * roamNodes.length)].position;
    const point = {
      x: waypoint.x + (rng() - 0.5) * 34,
      y: waypoint.y + (rng() - 0.5) * 34,
    };

    if (
      isOpenPoint(point, state) &&
      !isPointInAvoidTargetRect(point) &&
      (!avoidWalkways || !isPointOnMovingWalkway(point, state))
    ) {
      return point;
    }
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const point = {
      x: 44 + rng() * (GAME_WIDTH - 88),
      y: 44 + rng() * (GAME_HEIGHT - 88),
    };

    if (isOpenPoint(point, state) && !isPointInAvoidTargetRect(point) && !isPointOnMovingWalkway(point, state)) {
      return point;
    }
  }

  return { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
}

export function getMapZoneForPoint(point: Vector, state: GameState): MapZoneId | undefined {
  const priority: MapZoneId[] = [
    "upperRightLab",
    "lowerLeftOffice",
    "lowerRightStorage",
    "upperLeftLounge",
    "walkwayLane",
    "mainFloor",
  ];

  return priority.find((zoneId) => {
    const zone = getZone(zoneId, state);
    return zone ? isPointInRect(point, zone.bounds) : false;
  });
}

function chooseCommittedRoamZone(actor: Actor, state: GameState, rng: () => number): MapZoneId {
  const bot = actor.bot;
  if (!bot) {
    return pickRoamZone(state, rng)?.id ?? "mainFloor";
  }

  if (!bot.roamZone || bot.roamZone === "walkwayLane" || bot.zoneCommitmentTimer <= 0) {
    bot.roamZone = pickNextRoamZone(actor, state, rng);
    bot.zoneCommitmentTimer = lerp(5.5, 12, rng());
  }

  return bot.roamZone;
}

function getPointQuotaPressure(actor: Actor, state: GameState): number {
  const bot = actor.bot;
  if (!bot || actor.collected >= bot.pointQuota) {
    return 0;
  }

  const deficit = bot.pointQuota - actor.collected;
  let pressure = 0.68 + deficit * 0.08;

  if (state.timeElapsed > 12 && actor.collected === 0) {
    pressure += 0.1;
  }

  if (state.timeElapsed > 22) {
    pressure += 0.12;
  }

  if (state.timeElapsed > 33) {
    pressure += 0.14;
  }

  if (bot.personality === "Task-focused" || bot.personality === "Efficient") {
    pressure += 0.05;
  }

  if (bot.personality === "Hesitant" || bot.personality === "Looper") {
    pressure -= 0.04;
  }

  return clamp(pressure, 0.55, 0.97);
}

function pickNextRoamZone(actor: Actor, state: GameState, rng: () => number): MapZoneId {
  const bot = actor.bot;
  const currentZone = getMapZoneForPoint(actor.position, state);
  const weights = new Map<MapZoneId, number>();

  function add(zone: MapZoneId | undefined, weight: number) {
    if (!zone || zone === "walkwayLane") {
      return;
    }
    weights.set(zone, (weights.get(zone) ?? 0) + weight);
  }

  add(bot?.homeZone, currentZone === bot?.homeZone ? 1.5 : 2.6);
  add(currentZone, currentZone === "mainFloor" ? 0.65 : 1.35);
  add("mainFloor", currentZone === "mainFloor" ? 0.35 : 0.8);

  for (const zone of SIDE_ROOM_ZONES) {
    add(zone, zone === bot?.homeZone ? 0.95 : 0.55);
  }

  const entries = [...weights.entries()];
  if (entries.length === 0) {
    return pickRoamZone(state, rng)?.id ?? "mainFloor";
  }

  return weightedChoice(entries, rng);
}

function findAppealingItem(
  actor: Actor,
  state: GameState,
  rng: () => number,
  preferredZone?: MapZoneId,
  quotaDriven = false,
) {
  const active = state.items.filter((item) => item.active);
  if (active.length === 0) {
    return undefined;
  }

  const currentZone = getMapZoneForPoint(actor.position, state);
  const localItems = active.filter((item) => {
    const itemZone = getMapZoneForPoint(item.position, state);
    return itemZone === preferredZone || itemZone === currentZone;
  });
  const candidates = localItems.length > 0 ? localItems : quotaDriven || rng() < 0.25 ? active : [];
  if (candidates.length === 0) {
    return undefined;
  }
  const reserved = quotaDriven ? getReservedItemTargets(actor, state) : [];
  const availableCandidates = reserved.length > 0
    ? candidates.filter((item) => !reserved.some((point) => distance(point, item.position) < ACTOR_RADIUS * 2))
    : candidates;
  const targetCandidates = availableCandidates.length > 0 ? availableCandidates : candidates;

  const sorted = [...targetCandidates].sort(
    (a, b) => distance(actor.position, a.position) - distance(actor.position, b.position),
  );
  const pool = sorted.slice(0, Math.min(3, sorted.length));

  return quotaDriven || rng() < 0.52 ? pool[0] : pool[Math.floor(rng() * pool.length)];
}

function getReservedItemTargets(actor: Actor, state: GameState): Vector[] {
  return state.actors
    .filter((candidate) => candidate.id !== actor.id && candidate.bot?.targetKind === "item")
    .filter((candidate) => candidate.bot && candidate.collected < candidate.bot.pointQuota)
    .map((candidate) => candidate.bot?.finalTarget)
    .filter((point): point is Vector => Boolean(point));
}

function randomNearbyActor(actor: Actor, state: GameState, rng: () => number) {
  const others = state.actors.filter((candidate) => candidate.id !== actor.id);
  if (others.length === 0) {
    return undefined;
  }

  const sorted = [...others].sort(
    (a, b) => distance(actor.position, a.position) - distance(actor.position, b.position),
  );

  const pool = sorted.slice(0, Math.min(5, sorted.length));
  return pool[Math.floor(rng() * pool.length)];
}

function findDecorInZone(state: GameState, rng: () => number, preferredZone?: MapZoneId) {
  const localDecor = preferredZone
    ? state.decor.filter((decor) => getMapZoneForPoint(decor.position, state) === preferredZone)
    : [];
  const pool = localDecor.length > 0 ? localDecor : state.decor;
  return pool[Math.floor(rng() * pool.length)];
}

function randomOpenPointNear(
  center: Vector,
  state: GameState,
  rng: () => number,
  radius: number,
  fallbackZone?: MapZoneId,
): Vector {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const angle = rng() * Math.PI * 2;
    const gap = radius * (0.35 + rng() * 0.65);
    const point = {
      x: clamp(center.x + Math.cos(angle) * gap, ACTOR_RADIUS + 8, GAME_WIDTH - ACTOR_RADIUS - 8),
      y: clamp(center.y + Math.sin(angle) * gap, ACTOR_RADIUS + 8, GAME_HEIGHT - ACTOR_RADIUS - 8),
    };

    if (isOpenPoint(point, state) && !isPointInAvoidTargetRect(point) && !isPointOnMovingWalkway(point, state)) {
      return point;
    }
  }

  return randomOpenPoint(state, rng, fallbackZone);
}

function weightedChoice<T extends string>(entries: [T, number][], rng: () => number): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;

  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) {
      return value;
    }
  }

  return entries[entries.length - 1][0];
}

function pickRoamZone(state: GameState, rng: () => number) {
  const zones = state.mapLayer.zones.filter((zone) => zone.id !== "walkwayLane" && zone.roamWeight > 0);
  if (zones.length === 0) {
    return undefined;
  }

  const zoneId = weightedChoice(
    zones.map((zone) => [zone.id, zone.roamWeight] as [MapZoneId, number]),
    rng,
  );
  return getZone(zoneId, state);
}

function getZone(zoneId: MapZoneId, state: GameState) {
  return state.mapLayer.zones.find((zone) => zone.id === zoneId);
}

function randomPointInRect(rect: Rect, rng: () => number): Vector {
  return {
    x: rect.x + rng() * rect.width,
    y: rect.y + rng() * rect.height,
  };
}

function isOpenPoint(point: Vector, state: GameState): boolean {
  return !state.mapLayer.collisionRects.some((obstacle) => {
    const closestX = clamp(point.x, obstacle.x, obstacle.x + obstacle.width);
    const closestY = clamp(point.y, obstacle.y, obstacle.y + obstacle.height);
    return distance(point, { x: closestX, y: closestY }) < ACTOR_RADIUS + 10;
  });
}

function isPointOnMovingWalkway(point: Vector, state: GameState): boolean {
  return state.mapLayer.movingWalkways.some((walkway) => isPointInRect(point, walkway.rect));
}

function isPointInAvoidTargetRect(point: Vector): boolean {
  return BOT_AVOID_TARGET_RECTS.some((rect) => isPointInRect(point, rect));
}

function isPointInRect(point: Vector, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
