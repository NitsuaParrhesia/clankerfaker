import {
  ACTOR_COUNT,
  ACTOR_HEADING_TURN_RATE,
  ACTOR_RADIUS,
  ALARM_ACTIVE_DURATION,
  ALARM_TASK_TARGETS,
  ALARM_MAX_START_TIME,
  ALARM_MIN_START_TIME,
  ALARM_WARNING_DURATION,
  BOT_HEADING_TURN_RATE,
  BOT_COUNT,
  DECOR_POINTS,
  EXIT_ZONE,
  GAME_HEIGHT,
  GAME_WIDTH,
  HUMAN_SPEED,
  ITEM_COUNT,
  ITEM_RADIUS,
  ITEM_RESPAWN_MIN_SECONDS,
  ITEM_RESPAWN_RANDOM_SECONDS,
  MAP_LAYER,
  OBSTACLES,
  REQUIRED_ITEMS,
  ROUND_DURATION,
  SWEEPER_AVOID_RADIUS,
  SWEEPER_AVOID_STRENGTH,
  SWEEPER_PATROL_POINTS,
  SWEEPER_RADIUS,
  SWEEPER_RESPAWN_INVULNERABILITY,
  SWEEPER_RESPAWN_EFFECT_DURATION,
  SWEEPER_RESPAWN_SAFE_RADIUS,
  SWEEPER_SPEED,
  SWEEPER_STUN_COOLDOWN,
  SWEEPER_STUN_DURATION,
  TASK_HOLD_DURATION,
  TASK_TARGET_RADIUS,
  TERMINAL_TASK_TARGETS,
  WALKWAY_TASK_TARGETS,
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
  AlarmLight,
  AlarmState,
  BotBrain,
  BotNavigationNode,
  GameState,
  InputState,
  MapZoneId,
  MovingWalkway,
  RoundTask,
  Rect,
  TaskStep,
  SweeperState,
  Vector,
} from "./types";

const EMPTY_INPUT: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  moveX: 0,
  moveY: 0,
};

const COLLISION_SKIN = 0.45;
const COLLISION_EPSILON = 0.04;
const MAX_COLLISION_RESOLUTION_STEPS = 6;
const MAX_MOVEMENT_STEP = ACTOR_RADIUS * 0.45;
const PUBLIC_TASK_STEPS_PER_ROUND = 1;
const STICKY_BOT_ESCAPE_RECTS: Rect[] = [
  { x: 318, y: 96, width: 132, height: 222 },
];

export function createInitialGame(seed = createSeed()): GameState {
  const rng = mulberry32(seed);
  const humanIndex = Math.floor(rng() * ACTOR_COUNT);
  const task = createRoundTask(rng);
  const sweepers = createSweeperStates();
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
    requiredItems: task.required,
    botCollections: 0,
    task,
    alarm: createAlarmState(rng),
    sweeper: sweepers[0],
    sweepers,
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
      stunnedUntil: 0,
      stunCooldownUntil: 0,
      respawnAt: 0,
      respawnEffectUntil: 0,
      completedTaskIds: [],
      taskHoldStepId: null,
      taskHoldTime: 0,
      taskCooldownUntil: 0,
    };

    if (!isHuman) {
      const botHomeZone = homeZone ?? pickBotHomeZone(botIndex);
      const loopPoints = Array.from({ length: 3 }, () => randomOpenPoint(draftState, rng, botHomeZone));
      const botBrain: BotBrain = {
        personality,
        target: position,
        targetKind: "wander",
        targetTaskId: undefined,
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
        targetTaskId: target.targetTaskId,
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

function createSweeperStates(): SweeperState[] {
  return [
    createSweeperState("security-sweeper-a", 0, 1, 1),
    createSweeperState("security-sweeper-b", 5, 6, 0.96),
  ];
}

function createSweeperState(id: string, startIndex: number, targetIndex: number, speedMultiplier: number): SweeperState {
  const start = SWEEPER_PATROL_POINTS[startIndex] ?? SWEEPER_PATROL_POINTS[0];
  const next = SWEEPER_PATROL_POINTS[targetIndex] ?? start;

  return {
    id,
    position: { ...start },
    velocity: { x: 0, y: 0 },
    heading: Math.atan2(next.y - start.y, next.x - start.x),
    targetIndex,
    pauseTimer: 0,
    radius: SWEEPER_RADIUS,
    speed: SWEEPER_SPEED * speedMultiplier,
  };
}

function createRoundTask(rng: () => number): RoundTask {
  const optionalSteps = [
    pickTaskStep(TERMINAL_TASK_TARGETS, rng),
    pickTaskStep(ALARM_TASK_TARGETS, rng),
    pickTaskStep(WALKWAY_TASK_TARGETS, rng),
  ];
  shuffle(optionalSteps, rng);

  const steps: TaskStep[] = [
    {
      id: "collect-token",
      kind: "collect",
      label: "Collect 3 tokens",
      description: "Pick up three tokens without looking too direct.",
    },
    ...optionalSteps.slice(0, PUBLIC_TASK_STEPS_PER_ROUND),
  ];

  return {
    title: "Complete the task",
    description: "Collect three tokens and complete one public task before the clock runs out.",
    required: steps.length,
    steps,
  };
}

function pickTaskStep(steps: TaskStep[], rng: () => number): TaskStep {
  const step = steps[Math.floor(rng() * steps.length)];
  return {
    ...step,
    position: step.position ? { ...step.position } : undefined,
    rect: step.rect ? { ...step.rect } : undefined,
  };
}

function shuffle<T>(items: T[], rng: () => number): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

function createAlarmState(rng: () => number): AlarmState {
  const light = MAP_LAYER.alarmLights[Math.floor(rng() * MAP_LAYER.alarmLights.length)];
  const warningAt = ALARM_MIN_START_TIME + rng() * (ALARM_MAX_START_TIME - ALARM_MIN_START_TIME);
  const activeAt = warningAt + ALARM_WARNING_DURATION;

  return {
    lightId: light.id,
    warningAt,
    activeAt,
    endsAt: activeAt + ALARM_ACTIVE_DURATION,
    phase: "idle",
  };
}

function updateAlarmState(state: GameState): void {
  const { alarm } = state;

  if (state.timeElapsed >= alarm.endsAt) {
    alarm.phase = "done";
    return;
  }

  if (state.timeElapsed >= alarm.activeAt) {
    alarm.phase = "active";
    return;
  }

  if (state.timeElapsed >= alarm.warningAt) {
    alarm.phase = "warning";
    return;
  }

  alarm.phase = "idle";
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
  updateAlarmState(state);
  updateSweepers(state, safeDt);
  respawnKnockedOutActors(state);

  updateHuman(state, input, safeDt);
  updateBots(state, safeDt);
  collectItems(state);
  updateTaskProgress(state, safeDt);
  respawnItems(state);
  resolveActorCrowding(state);
  resolveActorsAgainstObstacles(state);
  applySweeperStuns(state);
  checkRoundEnd(state);
}

export function cloneGameStateForRender(state: GameState): GameState {
  return {
    ...state,
    alarm: { ...state.alarm },
    sweeper: {
      ...state.sweeper,
      position: { ...state.sweeper.position },
      velocity: { ...state.sweeper.velocity },
    },
    sweepers: state.sweepers.map((sweeper) => ({
      ...sweeper,
      position: { ...sweeper.position },
      velocity: { ...sweeper.velocity },
    })),
    actors: state.actors.map((actor) => ({
      ...actor,
      position: { ...actor.position },
      velocity: { ...actor.velocity },
      completedTaskIds: [...actor.completedTaskIds],
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

function updateSweepers(state: GameState, dt: number): void {
  for (const sweeper of state.sweepers) {
    updateSweeper(state, sweeper, dt);
  }
}

function updateSweeper(state: GameState, sweeper: SweeperState, dt: number): void {
  if (sweeper.pauseTimer > 0) {
    sweeper.pauseTimer = Math.max(0, sweeper.pauseTimer - dt);
    sweeper.velocity = { x: 0, y: 0 };
    return;
  }

  const target = SWEEPER_PATROL_POINTS[sweeper.targetIndex] ?? SWEEPER_PATROL_POINTS[0];
  const toTarget = {
    x: target.x - sweeper.position.x,
    y: target.y - sweeper.position.y,
  };
  const gap = Math.hypot(toTarget.x, toTarget.y);

  if (gap <= sweeper.radius) {
    sweeper.position = { ...target };
    sweeper.velocity = { x: 0, y: 0 };
    sweeper.targetIndex = chooseNextSweeperTargetIndex(sweeper.targetIndex, state);
    sweeper.pauseTimer = 0.08 + state.rng() * 0.24;
    return;
  }

  const direction = {
    x: toTarget.x / gap,
    y: toTarget.y / gap,
  };
  const distanceToMove = Math.min(gap, sweeper.speed * dt);
  sweeper.velocity = {
    x: direction.x * sweeper.speed,
    y: direction.y * sweeper.speed,
  };
  sweeper.heading = Math.atan2(direction.y, direction.x);
  sweeper.position.x = clamp(sweeper.position.x + direction.x * distanceToMove, sweeper.radius, GAME_WIDTH - sweeper.radius);
  sweeper.position.y = clamp(
    sweeper.position.y + direction.y * distanceToMove,
    sweeper.radius,
    GAME_HEIGHT - sweeper.radius,
  );
}

function chooseNextSweeperTargetIndex(currentIndex: number, state: GameState): number {
  const currentPoint = SWEEPER_PATROL_POINTS[currentIndex] ?? SWEEPER_PATROL_POINTS[0];
  const candidates = SWEEPER_PATROL_POINTS
    .map((point, index) => ({ index, point }))
    .filter((candidate) => candidate.index !== currentIndex)
    .filter((candidate) => distance(currentPoint, candidate.point) > 175);
  const pool = candidates.length > 0 ? candidates : SWEEPER_PATROL_POINTS.map((point, index) => ({ index, point }));

  return pool[Math.floor(state.rng() * pool.length)]?.index ?? 0;
}

function applySweeperStuns(state: GameState): void {
  for (const actor of state.actors) {
    if (actor.respawnAt > 0) {
      continue;
    }

    if (state.timeElapsed < actor.stunCooldownUntil) {
      continue;
    }

    const touchingSweeper = state.sweepers.find(
      (sweeper) => distance(actor.position, sweeper.position) <= actor.radius + sweeper.radius,
    );
    if (!touchingSweeper) {
      continue;
    }

    actor.velocity = { x: 0, y: 0 };
    resetActorProgress(state, actor);
    actor.respawnAt = state.timeElapsed + SWEEPER_STUN_DURATION;
    actor.stunnedUntil = actor.respawnAt;
    actor.stunCooldownUntil = Math.max(
      state.timeElapsed + SWEEPER_STUN_COOLDOWN,
      actor.respawnAt + SWEEPER_RESPAWN_INVULNERABILITY,
    );
    resetBotStuckCheck(actor);
  }
}

function respawnKnockedOutActors(state: GameState): void {
  for (const actor of state.actors) {
    if (actor.respawnAt <= 0 || state.timeElapsed < actor.respawnAt) {
      continue;
    }

    const respawnPoint = pickActorRespawnPoint(state, actor);
    actor.position = respawnPoint;
    actor.velocity = { x: 0, y: 0 };
    actor.heading = state.rng() * Math.PI * 2;
    actor.targetHeading = actor.heading;
    actor.respawnAt = 0;
    actor.stunnedUntil = 0;
    actor.respawnEffectUntil = state.timeElapsed + SWEEPER_RESPAWN_EFFECT_DURATION;
    actor.stunCooldownUntil = Math.max(actor.stunCooldownUntil, state.timeElapsed + SWEEPER_RESPAWN_INVULNERABILITY);
    resetBotAfterRespawn(actor, state);
  }
}

function resetActorProgress(state: GameState, actor: Actor): void {
  const lostPoints = actor.collected;
  const lostTaskCount = actor.completedTaskIds.length;
  if (lostPoints <= 0 && lostTaskCount <= 0) {
    return;
  }

  actor.collected = 0;
  actor.completedTaskIds = [];
  actor.taskHoldStepId = null;
  actor.taskHoldTime = 0;
  actor.taskCooldownUntil = state.timeElapsed + 0.35;

  if (actor.id === state.humanActorId) {
    state.humanCollected = 0;
    return;
  }

  state.botCollections = Math.max(0, state.botCollections - lostTaskCount);
}

function pickActorRespawnPoint(state: GameState, actor: Actor): Vector {
  const preferredZone = actor.bot?.homeZone;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const shouldUsePreferredZone = Boolean(preferredZone) && state.rng() < 0.55;
    const point = randomOpenPoint(state, state.rng, shouldUsePreferredZone ? preferredZone : undefined);

    if (isSafeRespawnPoint(point, actor, state)) {
      return point;
    }
  }

  const fallbackPoints = [
    ...state.mapLayer.itemSpawnPoints,
    ...state.mapLayer.botWaypoints,
    ...state.mapLayer.botNavigationNodes.map((node) => node.position),
  ]
    .filter((point) => isSafeRespawnPoint(point, actor, state))
    .sort((a, b) => distanceToClosestSweeper(b, state) - distanceToClosestSweeper(a, state));

  if (fallbackPoints.length > 0) {
    return { ...fallbackPoints[0] };
  }

  return placePointAwayFromActors(state, state.rng, preferredZone);
}

function isSafeRespawnPoint(point: Vector, actor: Actor, state: GameState): boolean {
  if (distanceToClosestSweeper(point, state) < SWEEPER_RESPAWN_SAFE_RADIUS) {
    return false;
  }

  if (collidesWithAnyObstacle(point, actor.radius + 2, state.obstacles)) {
    return false;
  }

  return state.actors.every(
    (candidate) => candidate.id === actor.id || distance(point, candidate.position) > ACTOR_RADIUS * 3,
  );
}

function resetBotAfterRespawn(actor: Actor, state: GameState): void {
  if (!actor.bot) {
    return;
  }

  actor.bot.pauseTimer = 0.35 + state.rng() * 0.55;
  actor.bot.retargetTimer = 0;
  actor.bot.path = [];
  actor.bot.pathIndex = 0;
  actor.bot.target = actor.position;
  actor.bot.finalTarget = actor.position;
  actor.bot.targetKind = "wander";
  actor.bot.targetActorId = undefined;
  actor.bot.targetTaskId = undefined;
  actor.bot.targetZone = getMapZoneForPoint(actor.position, state);
  actor.bot.roamZone = actor.bot.targetZone ?? actor.bot.roamZone;
  actor.bot.unstickCooldown = 0.7;
  resetBotStuckCheck(actor);
}

function isActorStunned(actor: Actor, state: GameState): boolean {
  return state.timeElapsed < actor.stunnedUntil;
}

function updateHuman(state: GameState, input: InputState, dt: number): void {
  const human = findHumanActor(state);

  if (isActorStunned(human, state)) {
    human.velocity = { x: 0, y: 0 };
    return;
  }

  const rawDirection = {
    x: clamp(input.moveX + (input.right ? 1 : 0) - (input.left ? 1 : 0), -1, 1),
    y: clamp(input.moveY + (input.down ? 1 : 0) - (input.up ? 1 : 0), -1, 1),
  };
  const speedScale = Math.min(1, Math.hypot(rawDirection.x, rawDirection.y));
  const direction = normalize(rawDirection);

  human.velocity = {
    x: direction.x * human.speed * speedScale,
    y: direction.y * human.speed * speedScale,
  };

  moveActor(state, human, human.velocity, dt);
}

function updateBots(state: GameState, dt: number): void {
  const activeAlarmLight = getActiveAlarmLight(state);

  for (const actor of state.actors) {
    if (actor.kind !== "bot" || !actor.bot) {
      continue;
    }

    const bot = actor.bot;
    bot.retargetTimer -= dt;
    bot.zoneCommitmentTimer = Math.max(0, bot.zoneCommitmentTimer - dt);
    bot.unstickCooldown = Math.max(0, bot.unstickCooldown - dt);

    if (activeAlarmLight) {
      assignAlarmBotTarget(actor, state, activeAlarmLight);
    } else if (bot.targetKind === "alarm") {
      assignNewBotTarget(actor, state);
    }

    if (
      !activeAlarmLight &&
      bot.targetTaskId &&
      actor.completedTaskIds.includes(bot.targetTaskId)
    ) {
      assignNewBotTarget(actor, state);
    }

    if (isActorStunned(actor, state)) {
      actor.velocity = { x: 0, y: 0 };
      resetBotStuckCheck(actor);
      continue;
    }

    if (bot.pauseTimer > 0) {
      bot.pauseTimer -= dt;
      actor.velocity = { x: 0, y: 0 };
      moveActor(state, actor, actor.velocity, dt);
      if (!activeAlarmLight && bot.pauseTimer <= 0 && state.rng() < 0.42) {
        assignNewBotTarget(actor, state);
      }
      continue;
    }

    let freshTarget = getCurrentBotTarget(actor, state);
    let distanceToTarget = distance(actor.position, freshTarget);

    if (!activeAlarmLight && bot.targetKind === "item" && !hasActiveItemNear(bot.finalTarget, state)) {
      assignNewBotTarget(actor, state);
      freshTarget = getCurrentBotTarget(actor, state);
      distanceToTarget = distance(actor.position, freshTarget);
    }

    if (distanceToTarget < actor.radius + 9) {
      if (advanceBotPath(actor)) {
        freshTarget = getCurrentBotTarget(actor, state);
        distanceToTarget = distance(actor.position, freshTarget);
      } else if (activeAlarmLight) {
        actor.velocity = { x: 0, y: 0 };
        resetBotStuckCheck(actor);
        continue;
      } else if (bot.targetKind === "task") {
        actor.velocity = { x: 0, y: 0 };
        bot.pauseTimer = Math.max(bot.pauseTimer, TASK_HOLD_DURATION + 0.2 + state.rng() * 0.45);
        resetBotStuckCheck(actor);
        continue;
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

    if (
      !activeAlarmLight &&
      bot.retargetTimer <= 0 &&
      bot.pathIndex >= bot.path.length - 1 &&
      distanceToTarget > actor.radius + 26
    ) {
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
    const hazardAdjustedDirection = activeAlarmLight
      ? walkwayAdjustedDirection
      : steerBotAwayFromSweeper(actor, walkwayAdjustedDirection, state);
    const steeredDirection = getMovingWalkwayAt(actor.position, state)
      ? hazardAdjustedDirection
      : steerBotDirection(actor, hazardAdjustedDirection, dt);
    const turnDelta = Math.abs(
      shortestAngleDelta(actor.heading, Math.atan2(hazardAdjustedDirection.y, hazardAdjustedDirection.x)),
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
  actor.bot.targetTaskId = next.targetTaskId;
  actor.bot.targetZone = next.targetZone;
  actor.bot.retargetTimer = getBotRetargetDelay(actor, state);
  resetBotStuckCheck(actor);
}

function assignAlarmBotTarget(actor: Actor, state: GameState, alarmLight: AlarmLight): void {
  if (!actor.bot) {
    return;
  }

  const bot = actor.bot;
  bot.pauseTimer = 0;
  bot.retargetTimer = 0.25;

  if (bot.targetKind === "alarm" && distance(bot.finalTarget, alarmLight.rallyPoint) < 1) {
    return;
  }

  const path = planBotPath(actor.position, alarmLight.rallyPoint, state);
  bot.path = path;
  bot.pathIndex = 0;
  bot.target = path[0] ?? alarmLight.rallyPoint;
  bot.finalTarget = alarmLight.rallyPoint;
  bot.targetKind = "alarm";
  bot.targetActorId = undefined;
  bot.targetTaskId = undefined;
  bot.targetZone = getMapZoneForPoint(alarmLight.rallyPoint, state);
  bot.roamZone = bot.targetZone ?? bot.roamZone;
  bot.unstickCooldown = 0;
  resetBotStuckCheck(actor);
}

function getActiveAlarmLight(state: GameState): AlarmLight | undefined {
  if (state.alarm.phase !== "active") {
    return undefined;
  }

  return state.mapLayer.alarmLights.find((light) => light.id === state.alarm.lightId);
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
  bot.targetTaskId = undefined;
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
      (actor) =>
        actor.respawnAt <= 0 &&
        !isActorStunned(actor, state) &&
        distance(actor.position, item.position) <= actor.radius + ITEM_RADIUS + 2,
    );
    const collector = chooseItemCollector(collectors, state, item.position);

    if (!collector) {
      continue;
    }

    item.active = false;
    item.respawnAt = state.timeElapsed + ITEM_RESPAWN_MIN_SECONDS + state.rng() * ITEM_RESPAWN_RANDOM_SECONDS;
    collector.collected += 1;
    completeCollectTask(state, collector);
  }
}

function updateTaskProgress(state: GameState, dt: number): void {
  for (const actor of state.actors) {
    if (actor.respawnAt > 0 || isActorStunned(actor, state)) {
      actor.taskHoldStepId = null;
      actor.taskHoldTime = 0;
      continue;
    }

    if (state.timeElapsed < actor.taskCooldownUntil) {
      continue;
    }

    const activeStep = findActiveHoldTaskStep(actor, state);
    if (!activeStep) {
      actor.taskHoldStepId = null;
      actor.taskHoldTime = 0;
      continue;
    }

    if (actor.taskHoldStepId !== activeStep.id) {
      actor.taskHoldStepId = activeStep.id;
      actor.taskHoldTime = 0;
    }

    const speed = Math.hypot(actor.velocity.x, actor.velocity.y);
    const canProgress = activeStep.kind === "walkway" || speed < actor.speed * 0.32;

    if (!canProgress) {
      actor.taskHoldTime = Math.max(0, actor.taskHoldTime - dt * 1.5);
      continue;
    }

    actor.taskHoldTime += dt;

    if (actor.taskHoldTime >= TASK_HOLD_DURATION) {
      completeTaskStep(state, actor, activeStep);
    }
  }
}

function completeCollectTask(state: GameState, actor: Actor): void {
  const collectStep = state.task.steps.find((step) => step.kind === "collect");
  if (!collectStep || actor.collected < REQUIRED_ITEMS) {
    return;
  }

  completeTaskStep(state, actor, collectStep);
}

function findActiveHoldTaskStep(actor: Actor, state: GameState): TaskStep | undefined {
  const incompleteSteps = state.task.steps.filter(
    (step) => step.kind !== "collect" && !actor.completedTaskIds.includes(step.id),
  );
  const currentStep = incompleteSteps.find(
    (step) => step.id === actor.taskHoldStepId && actorIsInsideTaskStep(actor, step),
  );

  if (currentStep) {
    return currentStep;
  }

  return incompleteSteps.find((step) => actorIsInsideTaskStep(actor, step));
}

function actorIsInsideTaskStep(actor: Actor, step: TaskStep): boolean {
  if (step.rect) {
    return isPointInRect(actor.position, step.rect);
  }

  if (step.position) {
    return distance(actor.position, step.position) <= (step.radius ?? TASK_TARGET_RADIUS);
  }

  return false;
}

function completeTaskStep(state: GameState, actor: Actor, step: TaskStep): void {
  if (actor.completedTaskIds.includes(step.id)) {
    return;
  }

  actor.completedTaskIds = [...actor.completedTaskIds, step.id];
  actor.taskHoldStepId = null;
  actor.taskHoldTime = 0;
  actor.taskCooldownUntil = state.timeElapsed + 0.25;

  if (actor.id === state.humanActorId) {
    state.humanCollected = Math.min(state.requiredItems, actor.completedTaskIds.length);
    return;
  }

  state.botCollections += 1;
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

function steerBotAwayFromSweeper(actor: Actor, desiredDirection: Vector, state: GameState): Vector {
  const sweeper = findClosestSweeper(actor.position, state);
  if (!sweeper) {
    return desiredDirection;
  }

  const fromSweeper = {
    x: actor.position.x - sweeper.position.x,
    y: actor.position.y - sweeper.position.y,
  };
  const gap = Math.hypot(fromSweeper.x, fromSweeper.y);

  if (gap <= 0.001 || gap > SWEEPER_AVOID_RADIUS) {
    return desiredDirection;
  }

  const away = {
    x: fromSweeper.x / gap,
    y: fromSweeper.y / gap,
  };
  const movingTowardSweeper = desiredDirection.x * -away.x + desiredDirection.y * -away.y;

  if (movingTowardSweeper < 0.12) {
    return desiredDirection;
  }

  const urgency = 1 - gap / SWEEPER_AVOID_RADIUS;
  return normalize({
    x: desiredDirection.x + away.x * SWEEPER_AVOID_STRENGTH * urgency,
    y: desiredDirection.y + away.y * SWEEPER_AVOID_STRENGTH * urgency,
  });
}

function findClosestSweeper(point: Vector, state: GameState): SweeperState | undefined {
  return [...state.sweepers].sort((a, b) => distance(point, a.position) - distance(point, b.position))[0];
}

function distanceToClosestSweeper(point: Vector, state: GameState): number {
  const sweeper = findClosestSweeper(point, state);
  return sweeper ? distance(point, sweeper.position) : Number.POSITIVE_INFINITY;
}

function steerBotOffMovingWalkway(actor: Actor, desiredDirection: Vector, state: GameState): Vector {
  const walkway = getMovingWalkwayAt(actor.position, state);
  if (!walkway) {
    return desiredDirection;
  }

  if (actor.bot?.targetKind === "task" && actor.bot.targetTaskId === `ride-${walkway.id}`) {
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
