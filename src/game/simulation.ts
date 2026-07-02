import {
  ACTOR_COUNT,
  ACTOR_HEADING_TURN_RATE,
  ACTOR_RADIUS,
  BOT_HEADING_TURN_RATE,
  BOT_COUNT,
  DECOR_POINTS,
  EXIT_ZONE,
  GAME_HEIGHT,
  GAME_WIDTH,
  HUMAN_SPEED,
  ITEM_COUNT,
  ITEM_RADIUS,
  MAP_LAYER,
  OBSTACLES,
  REQUIRED_ITEMS,
  ROUND_DURATION,
} from "./constants";
import {
  botJitter,
  chooseBotTarget,
  configureBotPointQuota,
  configureBotSpeed,
  getMapZoneForPoint,
  maybePauseBot,
  nextRetargetDelay,
  PERSONALITY_ORDER,
  pickBotHomeZone,
  randomOpenPoint,
} from "./botBehavior";
import type {
  Actor,
  BotBrain,
  BotNavigationNode,
  GameState,
  InputState,
  MapZoneId,
  MovingWalkway,
  Rect,
  Vector,
} from "./types";

const EMPTY_INPUT: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
};

const COLLISION_SKIN = 0.45;
const COLLISION_EPSILON = 0.04;
const MAX_COLLISION_RESOLUTION_STEPS = 6;
const MAX_MOVEMENT_STEP = ACTOR_RADIUS * 0.45;
const STICKY_BOT_ESCAPE_RECTS: Rect[] = [
  { x: 318, y: 96, width: 132, height: 222 },
];

export function createInitialGame(seed = createSeed()): GameState {
  const rng = mulberry32(seed);
  const humanIndex = Math.floor(rng() * ACTOR_COUNT);
  const draftState: GameState = {
    seed,
    rng,
    timeElapsed: 0,
    timeRemaining: ROUND_DURATION,
    status: "running",
    actors: [],
    items: [],
    mapLayer: MAP_LAYER,
    obstacles: OBSTACLES,
    decor: DECOR_POINTS,
    exit: EXIT_ZONE,
    humanActorId: "",
    humanCollected: 0,
    requiredItems: REQUIRED_ITEMS,
    botCollections: 0,
  };

  let botIndex = 0;
  for (let index = 0; index < ACTOR_COUNT; index += 1) {
    const isHuman = index === humanIndex;
    const personality = PERSONALITY_ORDER[index % PERSONALITY_ORDER.length];
    const homeZone = isHuman ? undefined : pickBotHomeZone(botIndex);
    const position = placePointAwayFromActors(draftState, rng, homeZone);
    const initialHeading = rng() * Math.PI * 2;
    const actor: Actor = {
      id: `actor-${index + 1}`,
      label: index + 1,
      kind: isHuman ? "human" : "bot",
      position,
      velocity: { x: 0, y: 0 },
      heading: initialHeading,
      targetHeading: initialHeading,
      speed: isHuman ? HUMAN_SPEED : configureBotSpeed(personality, rng),
      radius: ACTOR_RADIUS,
      collected: 0,
    };

    if (!isHuman) {
      const botHomeZone = homeZone ?? pickBotHomeZone(botIndex);
      const loopPoints = Array.from({ length: 3 }, () => randomOpenPoint(draftState, rng, botHomeZone));
      const botBrain: BotBrain = {
        personality,
        target: position,
        targetKind: "wander",
        homeZone: botHomeZone,
        roamZone: botHomeZone,
        zoneCommitmentTimer: 2 + rng() * 4,
        pointQuota: configureBotPointQuota(botIndex, rng),
        pauseTimer: 0,
        retargetTimer: 0,
        loopPoints,
        loopIndex: 0,
        finalTarget: position,
        path: [],
        pathIndex: 0,
        targetZone: getMapZoneForPoint(position, draftState),
        stuckTimer: 0,
        stuckCheckPosition: { ...position },
        unstickCooldown: 0,
      };
      const target = chooseBotTarget({ ...actor, bot: botBrain }, draftState, rng);
      const path = planBotPath(position, target.target, draftState);

      actor.bot = {
        ...botBrain,
        target: path[0] ?? target.target,
        targetKind: target.kind,
        targetActorId: target.targetActorId,
        finalTarget: target.target,
        path,
        pathIndex: 0,
        targetZone: target.targetZone,
        pauseTimer: rng() < 0.16 ? rng() * 0.8 : 0,
        retargetTimer: nextRetargetDelay(personality, rng),
        loopPoints,
        loopIndex: 0,
        stuckTimer: 0,
        stuckCheckPosition: { ...position },
        unstickCooldown: 0,
      };
      botIndex += 1;
    } else {
      draftState.humanActorId = actor.id;
    }

    draftState.actors.push(actor);
  }

  for (let index = 0; index < ITEM_COUNT; index += 1) {
    const spawnPoint = pickItemSpawnPoint(draftState, index);
    draftState.items.push({
      id: `item-${index + 1}`,
      position: spawnPoint,
      active: true,
      respawnAt: 0,
    });
  }

  if (draftState.actors.filter((actor) => actor.kind === "bot").length !== BOT_COUNT) {
    throw new Error("The MVP expects exactly ten bot actors.");
  }

  return draftState;
}

export function stepSimulation(
  state: GameState,
  input: InputState = EMPTY_INPUT,
  dt: number,
): void {
  if (state.status !== "running") {
    return;
  }

  const safeDt = Math.min(dt, 0.05);
  state.timeElapsed += safeDt;
  state.timeRemaining = Math.max(0, ROUND_DURATION - state.timeElapsed);

  updateHuman(state, input, safeDt);
  updateBots(state, safeDt);
  collectItems(state);
  respawnItems(state);
  resolveActorCrowding(state);
  resolveActorsAgainstObstacles(state);
  checkRoundEnd(state);
}

export function cloneGameStateForRender(state: GameState): GameState {
  return {
    ...state,
    actors: state.actors.map((actor) => ({
      ...actor,
      position: { ...actor.position },
      velocity: { ...actor.velocity },
      bot: actor.bot
        ? {
            ...actor.bot,
            target: { ...actor.bot.target },
            finalTarget: { ...actor.bot.finalTarget },
            path: actor.bot.path.map((point) => ({ ...point })),
            loopPoints: actor.bot.loopPoints.map((point) => ({ ...point })),
            stuckCheckPosition: { ...actor.bot.stuckCheckPosition },
          }
        : undefined,
    })),
    items: state.items.map((item) => ({
      ...item,
      position: { ...item.position },
    })),
  };
}

export function findHumanActor(state: GameState): Actor {
  const human = state.actors.find((actor) => actor.id === state.humanActorId);
  if (!human) {
    throw new Error("Human actor missing from game state.");
  }

  return human;
}

function updateHuman(state: GameState, input: InputState, dt: number): void {
  const human = findHumanActor(state);
  const direction = normalize({
    x: (input.right ? 1 : 0) - (input.left ? 1 : 0),
    y: (input.down ? 1 : 0) - (input.up ? 1 : 0),
  });

  human.velocity = {
    x: direction.x * human.speed,
    y: direction.y * human.speed,
  };

  moveActor(state, human, human.velocity, dt);
}

function updateBots(state: GameState, dt: number): void {
  for (const actor of state.actors) {
    if (actor.kind !== "bot" || !actor.bot) {
      continue;
    }

    const bot = actor.bot;
    bot.retargetTimer -= dt;
    bot.zoneCommitmentTimer = Math.max(0, bot.zoneCommitmentTimer - dt);
    bot.unstickCooldown = Math.max(0, bot.unstickCooldown - dt);

    if (bot.pauseTimer > 0) {
      bot.pauseTimer -= dt;
      actor.velocity = { x: 0, y: 0 };
      moveActor(state, actor, actor.velocity, dt);
      if (bot.pauseTimer <= 0 && state.rng() < 0.42) {
        assignNewBotTarget(actor, state);
      }
      continue;
    }

    let freshTarget = getCurrentBotTarget(actor, state);
    let distanceToTarget = distance(actor.position, freshTarget);

    if (bot.targetKind === "item" && !hasActiveItemNear(bot.finalTarget, state)) {
      assignNewBotTarget(actor, state);
      freshTarget = getCurrentBotTarget(actor, state);
      distanceToTarget = distance(actor.position, freshTarget);
    }

    if (distanceToTarget < actor.radius + 9) {
      if (advanceBotPath(actor)) {
        freshTarget = getCurrentBotTarget(actor, state);
        distanceToTarget = distance(actor.position, freshTarget);
      } else {
        const shouldKeepCollecting = bot.targetKind === "item" && actor.collected < bot.pointQuota;
        if (!shouldKeepCollecting && !isPointInMovingWalkway(actor.position, state)) {
          maybePauseBot(actor, state.rng);
        }
        assignNewBotTarget(actor, state);
        if (bot.pauseTimer > 0) {
          actor.velocity = { x: 0, y: 0 };
          resetBotStuckCheck(actor);
          continue;
        }
        freshTarget = getCurrentBotTarget(actor, state);
        distanceToTarget = distance(actor.position, freshTarget);
      }
    }

    if (bot.retargetTimer <= 0 && bot.pathIndex >= bot.path.length - 1 && distanceToTarget > actor.radius + 26) {
      maybePauseBot(actor, state.rng);
      assignNewBotTarget(actor, state);
      if (bot.pauseTimer > 0) {
        actor.velocity = { x: 0, y: 0 };
        resetBotStuckCheck(actor);
        continue;
      }
      freshTarget = getCurrentBotTarget(actor, state);
    }

    const direction = normalize({
      x: freshTarget.x - actor.position.x,
      y: freshTarget.y - actor.position.y,
    });
    const wobble = (state.rng() - 0.5) * botJitter(bot.personality);
    const movedDirection = rotate(direction, wobble);
    const walkwayAdjustedDirection = steerBotOffMovingWalkway(actor, movedDirection, state);
    const steeredDirection = getMovingWalkwayAt(actor.position, state)
      ? walkwayAdjustedDirection
      : steerBotDirection(actor, walkwayAdjustedDirection, dt);
    const turnDelta = Math.abs(
      shortestAngleDelta(actor.heading, Math.atan2(walkwayAdjustedDirection.y, walkwayAdjustedDirection.x)),
    );
    const turnSlowdown = turnDelta > Math.PI * 0.62 ? 0.62 : turnDelta > Math.PI * 0.36 ? 0.82 : 1;

    actor.velocity = {
      x: steeredDirection.x * actor.speed * turnSlowdown,
      y: steeredDirection.y * actor.speed * turnSlowdown,
    };

    const collided = moveActor(state, actor, actor.velocity, dt);
    updateBotStuckState(actor, state, collided, dt);
  }
}

function assignNewBotTarget(actor: Actor, state: GameState): void {
  if (!actor.bot) {
    return;
  }

  const next = chooseBotTarget(actor, state, state.rng);
  const path = planBotPath(actor.position, next.target, state);
  actor.bot.path = path;
  actor.bot.pathIndex = 0;
  actor.bot.target = path[0] ?? next.target;
  actor.bot.finalTarget = next.target;
  actor.bot.targetKind = next.kind;
  actor.bot.targetActorId = next.targetActorId;
  actor.bot.targetZone = next.targetZone;
  actor.bot.retargetTimer = getBotRetargetDelay(actor, state);
  resetBotStuckCheck(actor);
}

function getCurrentBotTarget(actor: Actor, state: GameState): Vector {
  const bot = actor.bot;
  if (!bot) {
    return actor.position;
  }

  if (bot.targetKind === "actor" && bot.targetActorId && bot.pathIndex >= bot.path.length - 1) {
    const targetActor = state.actors.find((candidate) => candidate.id === bot.targetActorId);
    if (targetActor) {
      bot.finalTarget = targetActor.position;
      bot.target = targetActor.position;
      return targetActor.position;
    }
  }

  return bot.target;
}

function advanceBotPath(actor: Actor): boolean {
  const bot = actor.bot;
  if (!bot || bot.pathIndex >= bot.path.length - 1) {
    return false;
  }

  bot.pathIndex += 1;
  bot.target = bot.path[bot.pathIndex];
  resetBotStuckCheck(actor);
  return true;
}

function updateBotStuckState(actor: Actor, state: GameState, collided: boolean, dt: number): void {
  const bot = actor.bot;
  if (!bot || bot.unstickCooldown > 0) {
    return;
  }

  if (Math.hypot(actor.velocity.x, actor.velocity.y) < 4 || bot.pauseTimer > 0) {
    resetBotStuckCheck(actor);
    return;
  }

  const progress = distance(actor.position, bot.stuckCheckPosition);
  if (progress > 14) {
    resetBotStuckCheck(actor);
    return;
  }

  bot.stuckTimer += collided ? dt * 2.4 : dt;
  const stuckLimit = isPointInStickyBotArea(actor.position) ? 0.34 : 0.72;
  if (bot.stuckTimer >= stuckLimit) {
    assignBotEscapeTarget(actor, state);
  }
}

function assignBotEscapeTarget(actor: Actor, state: GameState): void {
  const bot = actor.bot;
  if (!bot) {
    return;
  }

  const escapeNode = findEscapeNode(actor.position, state);
  const preferredZone = getMapZoneForPoint(actor.position, state);
  const target = escapeNode?.position ?? randomOpenPoint(state, state.rng, preferredZone);
  const path = planBotPath(actor.position, target, state);

  bot.path = path;
  bot.pathIndex = 0;
  bot.target = path[0] ?? target;
  bot.finalTarget = target;
  bot.targetKind = "wander";
  bot.targetActorId = undefined;
  bot.targetZone = getMapZoneForPoint(target, state);
  bot.roamZone = bot.targetZone ?? bot.roamZone;
  bot.zoneCommitmentTimer = Math.max(bot.zoneCommitmentTimer, 1.4);
  bot.retargetTimer = 0.75 + state.rng() * 0.75;
  bot.pauseTimer = 0;
  bot.unstickCooldown = 0.8;
  resetBotStuckCheck(actor);
}

function planBotPath(start: Vector, target: Vector, state: GameState): Vector[] {
  if (lineIsClear(start, target, state)) {
    return [target];
  }

  const startNode = findBestRouteNode(start, state);
  const targetNode = findBestRouteNode(target, state, getMapZoneForPoint(target, state));

  if (!startNode || !targetNode) {
    return [target];
  }

  const nodePath = findNodePath(startNode.id, targetNode.id, state);
  if (nodePath.length === 0) {
    return [startNode.position, targetNode.position, target];
  }

  const route = nodePath.map((node) => node.position);
  route.push(target);
  return compactRoute(start, route);
}

function findBestRouteNode(
  point: Vector,
  state: GameState,
  preferredZone = getMapZoneForPoint(point, state),
): BotNavigationNode | undefined {
  const allNodes = state.mapLayer.botNavigationNodes.filter((node) => node.kind !== "walkway");
  const zoneNodes = preferredZone ? allNodes.filter((node) => node.zone === preferredZone) : [];
  const candidates = zoneNodes.length > 0 ? zoneNodes : allNodes;

  return [...candidates].sort((a, b) => routeNodeScore(point, a, state) - routeNodeScore(point, b, state))[0];
}

function routeNodeScore(point: Vector, node: BotNavigationNode, state: GameState): number {
  const clearPenalty = lineIsClear(point, node.position, state) ? 0 : 180;
  const doorwayBonus = node.kind === "doorway" ? -18 : 0;
  return distance(point, node.position) + clearPenalty + doorwayBonus;
}

function findNodePath(startId: string, endId: string, state: GameState): BotNavigationNode[] {
  const nodes = new Map(
    state.mapLayer.botNavigationNodes
      .filter((node) => node.kind !== "walkway")
      .map((node) => [node.id, node]),
  );
  if (!nodes.has(startId) || !nodes.has(endId)) {
    return [];
  }

  const queue = [startId];
  const previous = new Map<string, string | null>([[startId, null]]);

  for (let index = 0; index < queue.length; index += 1) {
    const currentId = queue[index];
    if (currentId === endId) {
      break;
    }

    const current = nodes.get(currentId);
    if (!current) {
      continue;
    }

    for (const nextId of current.links) {
      if (previous.has(nextId) || !nodes.has(nextId)) {
        continue;
      }
      previous.set(nextId, currentId);
      queue.push(nextId);
    }
  }

  if (!previous.has(endId)) {
    return [];
  }

  const path: BotNavigationNode[] = [];
  let cursor: string | null = endId;
  while (cursor) {
    const node = nodes.get(cursor);
    if (node) {
      path.unshift(node);
    }
    cursor = previous.get(cursor) ?? null;
  }

  return path;
}

function findEscapeNode(point: Vector, state: GameState): BotNavigationNode | undefined {
  const sourceIsSticky = isPointInStickyBotArea(point);
  const candidates = state.mapLayer.botNavigationNodes
    .filter((node) => node.kind !== "walkway")
    .filter((node) => !sourceIsSticky || !isPointInStickyBotArea(node.position))
    .filter((node) => {
      const gap = distance(point, node.position);
      return gap > 34 && gap < 260;
    });

  const visible = candidates
    .filter((node) => lineIsClear(point, node.position, state))
    .sort((a, b) => distance(point, a.position) - distance(point, b.position));

  if (visible.length > 0) {
    return visible[Math.floor(state.rng() * Math.min(4, visible.length))];
  }

  return candidates.sort((a, b) => distance(point, a.position) - distance(point, b.position))[0];
}

function isPointInStickyBotArea(point: Vector): boolean {
  return STICKY_BOT_ESCAPE_RECTS.some((rect) => isPointInRect(point, rect));
}

function compactRoute(start: Vector, route: Vector[]): Vector[] {
  const compacted: Vector[] = [];
  let previous = start;

  for (const point of route) {
    if (distance(previous, point) < 18) {
      continue;
    }
    compacted.push(point);
    previous = point;
  }

  return compacted;
}

function lineIsClear(start: Vector, end: Vector, state: GameState): boolean {
  const gap = distance(start, end);
  const steps = Math.max(1, Math.ceil(gap / 12));

  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const point = {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };

    if (collidesWithAnyObstacle(point, ACTOR_RADIUS + 4, state.obstacles)) {
      return false;
    }
  }

  return true;
}

function resetBotStuckCheck(actor: Actor): void {
  if (!actor.bot) {
    return;
  }

  actor.bot.stuckTimer = 0;
  actor.bot.stuckCheckPosition = { ...actor.position };
}

function getBotRetargetDelay(actor: Actor, state: GameState): number {
  const bot = actor.bot;
  if (!bot) {
    return 0;
  }

  const baseDelay = nextRetargetDelay(bot.personality, state.rng);
  if (actor.collected >= bot.pointQuota) {
    return baseDelay;
  }

  const urgency = state.timeElapsed > 28 ? 0.32 : state.timeElapsed > 16 ? 0.42 : 0.55;
  return Math.max(0.35, baseDelay * urgency);
}

function hasActiveItemNear(point: Vector, state: GameState): boolean {
  return state.items.some((item) => item.active && distance(point, item.position) <= ITEM_RADIUS + 5);
}

function collectItems(state: GameState): void {
  for (const item of state.items) {
    if (!item.active) {
      continue;
    }

    const collectors = state.actors.filter(
      (actor) => distance(actor.position, item.position) <= actor.radius + ITEM_RADIUS + 2,
    );
    const collector = chooseItemCollector(collectors, state, item.position);

    if (!collector) {
      continue;
    }

    item.active = false;
    item.respawnAt = state.timeElapsed + 1.8 + state.rng() * 2.7;
    collector.collected += 1;

    if (collector.id === state.humanActorId) {
      state.humanCollected = Math.min(state.requiredItems, state.humanCollected + 1);
    } else {
      state.botCollections += 1;
    }
  }
}

function chooseItemCollector(
  candidates: Actor[],
  state: GameState,
  itemPosition: Vector,
): Actor | undefined {
  const hungryQuotaBotsExist = state.actors.some(
    (actor) => actor.bot && actor.bot.pointQuota >= REQUIRED_ITEMS && actor.collected < actor.bot.pointQuota,
  );
  const eligible = candidates.filter((actor) => {
    if (actor.kind === "human" || !actor.bot) {
      return true;
    }

    if (actor.collected < actor.bot.pointQuota) {
      return true;
    }

    return !hungryQuotaBotsExist;
  });

  return [...eligible].sort((a, b) => {
    const priorityDelta = itemCollectionPriority(b) - itemCollectionPriority(a);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return distance(a.position, itemPosition) - distance(b.position, itemPosition);
  })[0];
}

function itemCollectionPriority(actor: Actor): number {
  if (actor.kind === "human") {
    return 100;
  }

  if (!actor.bot) {
    return 0;
  }

  const deficit = actor.bot.pointQuota - actor.collected;
  if (deficit <= 0) {
    return 1;
  }

  return 10 + deficit;
}

function respawnItems(state: GameState): void {
  for (const item of state.items) {
    if (!item.active && state.timeElapsed >= item.respawnAt) {
      item.position = pickQuotaFriendlyItemSpawnPoint(state) ?? pickItemSpawnPoint(state);
      item.active = true;
    }
  }
}

function pickQuotaFriendlyItemSpawnPoint(state: GameState): Vector | undefined {
  const hungryBots = state.actors
    .filter((actor) => actor.bot && actor.collected < actor.bot.pointQuota)
    .sort((a, b) => {
      const aDeficit = (a.bot?.pointQuota ?? 0) - a.collected;
      const bDeficit = (b.bot?.pointQuota ?? 0) - b.collected;
      return bDeficit - aDeficit || a.collected - b.collected;
    });

  if (hungryBots.length === 0 || state.rng() > 0.82) {
    return undefined;
  }

  const targetBot = hungryBots[Math.floor(state.rng() * Math.min(4, hungryBots.length))];
  const candidates = state.mapLayer.itemSpawnPoints
    .filter((point) => !state.items.some((item) => item.active && distance(item.position, point) < ITEM_RADIUS * 4))
    .filter((point) => !collidesWithAnyObstacle(point, ITEM_RADIUS + 4, state.mapLayer.collisionRects))
    .sort((a, b) => distance(targetBot.position, a) - distance(targetBot.position, b));

  return candidates[0] ? { ...candidates[0] } : undefined;
}

function checkRoundEnd(state: GameState): void {
  if (state.timeRemaining <= 0) {
    state.status = state.humanCollected >= state.requiredItems ? "human-won" : "timeout";
    state.timeRemaining = 0;
  }
}

function moveActor(state: GameState, actor: Actor, velocity: Vector, dt: number): boolean {
  let collided = false;
  const boostedVelocity = applyMovingWalkwayBoost(state, actor.position, velocity);
  updateActorHeading(actor, boostedVelocity, dt);

  const movement = {
    x: boostedVelocity.x * dt,
    y: boostedVelocity.y * dt,
  };
  const distanceToMove = Math.hypot(movement.x, movement.y);
  const steps = Math.max(1, Math.ceil(distanceToMove / MAX_MOVEMENT_STEP));
  const step = {
    x: movement.x / steps,
    y: movement.y / steps,
  };

  for (let index = 0; index < steps; index += 1) {
    const before = { ...actor.position };
    actor.position.x = clamp(actor.position.x + step.x, actor.radius, GAME_WIDTH - actor.radius);
    actor.position.y = clamp(actor.position.y + step.y, actor.radius, GAME_HEIGHT - actor.radius);

    const corrected = resolveActorObstaclePenetration(actor, state.obstacles);
    if (corrected || distance(before, actor.position) < Math.hypot(step.x, step.y) * 0.55) {
      collided = true;
    }
  }

  return collided;
}

function updateActorHeading(actor: Actor, velocity: Vector, dt: number): void {
  if (Math.hypot(velocity.x, velocity.y) < 1) {
    return;
  }

  actor.targetHeading = Math.atan2(velocity.y, velocity.x);
  const turnRate = actor.kind === "bot" ? BOT_HEADING_TURN_RATE : ACTOR_HEADING_TURN_RATE;
  const delta = shortestAngleDelta(actor.heading, actor.targetHeading);
  const step = clamp(delta, -turnRate * dt, turnRate * dt);
  actor.heading = normalizeAngle(actor.heading + step);
}

function steerBotDirection(actor: Actor, desiredDirection: Vector, dt: number): Vector {
  if (Math.hypot(desiredDirection.x, desiredDirection.y) < 0.001) {
    return desiredDirection;
  }

  const desiredHeading = Math.atan2(desiredDirection.y, desiredDirection.x);
  const delta = shortestAngleDelta(actor.heading, desiredHeading);
  const step = clamp(delta, -BOT_HEADING_TURN_RATE * dt, BOT_HEADING_TURN_RATE * dt);
  const steeredHeading = normalizeAngle(actor.heading + step);

  return {
    x: Math.cos(steeredHeading),
    y: Math.sin(steeredHeading),
  };
}

function steerBotOffMovingWalkway(actor: Actor, desiredDirection: Vector, state: GameState): Vector {
  const walkway = getMovingWalkwayAt(actor.position, state);
  if (!walkway) {
    return desiredDirection;
  }

  const target = actor.bot?.finalTarget ?? actor.position;
  const horizontalWalkway = Math.abs(walkway.direction.x) >= Math.abs(walkway.direction.y);

  if (horizontalWalkway) {
    const centerY = walkway.rect.y + walkway.rect.height / 2;
    const exitSign = target.y < centerY ? -1 : target.y > centerY ? 1 : actor.position.y < centerY ? -1 : 1;
    return normalize({
      x: desiredDirection.x * 0.16,
      y: exitSign,
    });
  }

  const centerX = walkway.rect.x + walkway.rect.width / 2;
  const exitSign = target.x < centerX ? -1 : target.x > centerX ? 1 : actor.position.x < centerX ? -1 : 1;
  return normalize({
    x: exitSign,
    y: desiredDirection.y * 0.16,
  });
}

function applyMovingWalkwayBoost(state: GameState, position: Vector, velocity: Vector): Vector {
  const walkway = getMovingWalkwayAt(position, state);

  if (!walkway) {
    return velocity;
  }

  return {
    x: velocity.x + walkway.direction.x * walkway.speed,
    y: velocity.y + walkway.direction.y * walkway.speed,
  };
}

function isPointInMovingWalkway(position: Vector, state: GameState): boolean {
  return state.mapLayer.movingWalkways.some((walkway) => isPointInRect(position, walkway.rect));
}

function getMovingWalkwayAt(position: Vector, state: GameState): MovingWalkway | undefined {
  return state.mapLayer.movingWalkways.find((walkway) => isPointInRect(position, walkway.rect));
}

function resolveActorCrowding(state: GameState): void {
  for (let i = 0; i < state.actors.length; i += 1) {
    for (let j = i + 1; j < state.actors.length; j += 1) {
      const a = state.actors[i];
      const b = state.actors[j];
      const delta = { x: b.position.x - a.position.x, y: b.position.y - a.position.y };
      const gap = Math.hypot(delta.x, delta.y);
      const minimum = a.radius + b.radius + 2;

      if (gap > 0 && gap < minimum) {
        const push = (minimum - gap) * 0.5;
        const direction = { x: delta.x / gap, y: delta.y / gap };
        a.position.x = clamp(a.position.x - direction.x * push, a.radius, GAME_WIDTH - a.radius);
        a.position.y = clamp(a.position.y - direction.y * push, a.radius, GAME_HEIGHT - a.radius);
        b.position.x = clamp(b.position.x + direction.x * push, b.radius, GAME_WIDTH - b.radius);
        b.position.y = clamp(b.position.y + direction.y * push, b.radius, GAME_HEIGHT - b.radius);
      }
    }
  }
}

function resolveActorsAgainstObstacles(state: GameState): void {
  for (const actor of state.actors) {
    resolveActorObstaclePenetration(actor, state.obstacles);
  }
}

function resolveActorObstaclePenetration(actor: Actor, obstacles: Rect[]): boolean {
  let adjusted = false;

  for (let step = 0; step < MAX_COLLISION_RESOLUTION_STEPS; step += 1) {
    let strongest: { normal: Vector; depth: number } | null = null;

    for (const obstacle of obstacles) {
      const penetration = circleRectPenetration(actor.position, actor.radius + COLLISION_SKIN, obstacle);
      if (penetration && (!strongest || penetration.depth > strongest.depth)) {
        strongest = penetration;
      }
    }

    if (!strongest) {
      break;
    }

    actor.position.x = clamp(
      actor.position.x + strongest.normal.x * (strongest.depth + COLLISION_EPSILON),
      actor.radius,
      GAME_WIDTH - actor.radius,
    );
    actor.position.y = clamp(
      actor.position.y + strongest.normal.y * (strongest.depth + COLLISION_EPSILON),
      actor.radius,
      GAME_HEIGHT - actor.radius,
    );
    adjusted = true;
  }

  return adjusted;
}

function circleRectPenetration(
  point: Vector,
  radius: number,
  rect: Rect,
): { normal: Vector; depth: number } | null {
  const closestX = clamp(point.x, rect.x, rect.x + rect.width);
  const closestY = clamp(point.y, rect.y, rect.y + rect.height);
  const delta = {
    x: point.x - closestX,
    y: point.y - closestY,
  };
  const distanceSquared = delta.x * delta.x + delta.y * delta.y;

  if (distanceSquared > 0) {
    const gap = Math.sqrt(distanceSquared);
    if (gap >= radius) {
      return null;
    }

    return {
      normal: { x: delta.x / gap, y: delta.y / gap },
      depth: radius - gap,
    };
  }

  const distances = [
    { normal: { x: -1, y: 0 }, depth: radius + Math.abs(point.x - rect.x) },
    { normal: { x: 1, y: 0 }, depth: radius + Math.abs(rect.x + rect.width - point.x) },
    { normal: { x: 0, y: -1 }, depth: radius + Math.abs(point.y - rect.y) },
    { normal: { x: 0, y: 1 }, depth: radius + Math.abs(rect.y + rect.height - point.y) },
  ];

  return distances.reduce((best, candidate) => (candidate.depth < best.depth ? candidate : best));
}

function placePointAwayFromActors(state: GameState, rng: () => number, preferredZone?: MapZoneId): Vector {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const point = randomOpenPoint(state, rng, preferredZone);
    const hasSpace = state.actors.every((actor) => distance(point, actor.position) > ACTOR_RADIUS * 3);
    if (hasSpace) {
      return point;
    }
  }

  return randomOpenPoint(state, rng);
}

function pickItemSpawnPoint(state: GameState, preferredIndex?: number): Vector {
  const spawnPoints = state.mapLayer.itemSpawnPoints;
  const startIndex =
    preferredIndex == null
      ? Math.floor(state.rng() * spawnPoints.length)
      : preferredIndex % spawnPoints.length;

  for (let offset = 0; offset < spawnPoints.length; offset += 1) {
    const point = spawnPoints[(startIndex + offset) % spawnPoints.length];
    const occupied = state.items.some(
      (item) => item.active && distance(item.position, point) < ITEM_RADIUS * 4,
    );

    if (!occupied && !collidesWithAnyObstacle(point, ITEM_RADIUS + 4, state.mapLayer.collisionRects)) {
      return { ...point };
    }
  }

  return { ...spawnPoints[startIndex] };
}

function collidesWithAnyObstacle(point: Vector, radius: number, obstacles: Rect[]): boolean {
  return obstacles.some((obstacle) => circleRectCollision(point, radius, obstacle));
}

function circleRectCollision(point: Vector, radius: number, rect: Rect): boolean {
  const closestX = clamp(point.x, rect.x, rect.x + rect.width);
  const closestY = clamp(point.y, rect.y, rect.y + rect.height);
  return distance(point, { x: closestX, y: closestY }) < radius;
}

function isPointInRect(point: Vector, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function normalize(vector: Vector): Vector {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function rotate(vector: Vector, radians: number): Vector {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function shortestAngleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
