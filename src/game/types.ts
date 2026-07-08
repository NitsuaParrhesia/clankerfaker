export type GamePhase =
  | "title"
  | "leaderboard"
  | "hide"
  | "invalid-run"
  | "handoff"
  | "loading-pool"
  | "pool-empty"
  | "replay"
  | "results"
  | "loading-share"
  | "share-error";

export type Vector = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MapZoneId =
  | "mainFloor"
  | "upperLeftLounge"
  | "upperRightLab"
  | "lowerLeftOffice"
  | "lowerRightStorage"
  | "walkwayLane";

export type MapZone = {
  id: MapZoneId;
  bounds: Rect;
  roamWeight: number;
};

export type BotNavigationNodeKind = "roam" | "doorway" | "transit" | "walkway";

export type BotNavigationNode = {
  id: string;
  position: Vector;
  zone: MapZoneId;
  kind: BotNavigationNodeKind;
  links: string[];
};

export type CoverZone = {
  id: string;
  center: Vector;
  radius: number;
};

export type AlarmLightId = "northWest" | "northEast" | "southWest" | "southEast";

export type AlarmPhase = "idle" | "warning" | "active" | "done";

export type AlarmLight = {
  id: AlarmLightId;
  position: Vector;
  rallyPoint: Vector;
};

export type AlarmState = {
  lightId: AlarmLightId;
  warningAt: number;
  activeAt: number;
  endsAt: number;
  phase: AlarmPhase;
};

export type AlarmSnapshot = {
  lightId: AlarmLightId;
  phase: Exclude<AlarmPhase, "idle" | "done">;
  progress: number;
};

export type SweeperState = {
  id: string;
  position: Vector;
  velocity: Vector;
  heading: number;
  targetIndex: number;
  pauseTimer: number;
  radius: number;
  speed: number;
};

export type SweeperSnapshot = {
  id: string;
  x: number;
  y: number;
  heading: number;
};

export type ActorKind = "human" | "bot";

export type BotPersonality =
  | "Wanderer"
  | "Task-focused"
  | "Hesitant"
  | "Curious"
  | "Looper"
  | "Efficient"
  | "Distracted";

export type BotTargetKind = "item" | "task" | "exit" | "wander" | "actor" | "decor" | "loop" | "alarm";

export type TaskStepKind = "collect" | "terminal" | "alarm" | "walkway";

export type TaskStep = {
  id: string;
  kind: TaskStepKind;
  label: string;
  description: string;
  targetId?: string;
  position?: Vector;
  radius?: number;
  rect?: Rect;
};

export type RoundTask = {
  title: string;
  description: string;
  required: number;
  steps: TaskStep[];
};

export type BotBrain = {
  personality: BotPersonality;
  target: Vector;
  targetKind: BotTargetKind;
  targetActorId?: string;
  targetTaskId?: string;
  homeZone: MapZoneId;
  roamZone?: MapZoneId;
  zoneCommitmentTimer: number;
  pointQuota: number;
  pauseTimer: number;
  retargetTimer: number;
  loopPoints: Vector[];
  loopIndex: number;
  finalTarget: Vector;
  path: Vector[];
  pathIndex: number;
  targetZone?: MapZoneId;
  stuckTimer: number;
  stuckCheckPosition: Vector;
  unstickCooldown: number;
};

export type Actor = {
  id: string;
  label: number;
  kind: ActorKind;
  position: Vector;
  velocity: Vector;
  heading: number;
  targetHeading: number;
  speed: number;
  radius: number;
  collected: number;
  stunnedUntil: number;
  stunCooldownUntil: number;
  respawnAt: number;
  respawnEffectUntil: number;
  completedTaskIds: string[];
  taskHoldStepId: string | null;
  taskHoldTime: number;
  taskCooldownUntil: number;
  bot?: BotBrain;
};

export type Collectible = {
  id: string;
  position: Vector;
  active: boolean;
  respawnAt: number;
};

export type DecorPoint = {
  id: string;
  position: Vector;
  radius: number;
};

export type MapLayer = {
  outerWalls: Rect[];
  interiorWalls: Rect[];
  doorwayGaps: Rect[];
  obstacleRects: Rect[];
  movingWalkways: MovingWalkway[];
  collisionRects: Rect[];
  itemSpawnPoints: Vector[];
  botWaypoints: Vector[];
  zones: MapZone[];
  botNavigationNodes: BotNavigationNode[];
  exit: Rect;
  decor: DecorPoint[];
  coverZones: CoverZone[];
  alarmLights: AlarmLight[];
};

export type MovingWalkway = {
  id: string;
  rect: Rect;
  direction: Vector;
  speed: number;
};

export type InputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  moveX: number;
  moveY: number;
};

export type GameStatus = "running" | "human-won" | "timeout";

export type GameState = {
  seed: number;
  rng: () => number;
  timeElapsed: number;
  timeRemaining: number;
  status: GameStatus;
  actors: Actor[];
  items: Collectible[];
  mapLayer: MapLayer;
  obstacles: Rect[];
  decor: DecorPoint[];
  exit: Rect;
  humanActorId: string;
  humanCollected: number;
  requiredItems: number;
  botCollections: number;
  task: RoundTask;
  alarm: AlarmState;
  sweeper: SweeperState;
  sweepers: SweeperState[];
};

export type ActorSnapshot = {
  id: string;
  label: number;
  x: number;
  y: number;
  heading: number;
  collected: number;
  stunned: boolean;
  takedownProgress?: number;
  respawnProgress?: number;
  bot?: BotDebugSnapshot;
};

export type BotDebugSnapshot = {
  personality: BotPersonality;
  targetKind: BotTargetKind;
  state: "seeking" | "pathing" | "paused" | "unsticking";
  target: Vector;
  finalTarget: Vector;
  targetTaskId?: string;
  path: Vector[];
  pathIndex: number;
  targetZone?: MapZoneId;
  homeZone: MapZoneId;
  roamZone?: MapZoneId;
  pointQuota: number;
  pauseTimer: number;
  retargetTimer: number;
  stuckTimer: number;
  unstickCooldown: number;
};

export type ItemSnapshot = {
  id: string;
  x: number;
  y: number;
  active: boolean;
};

export type ReplaySnapshot = {
  timestamp: number;
  actors: ActorSnapshot[];
  items: ItemSnapshot[];
  humanCollected: number;
  objectiveReady: boolean;
  completedTaskIds: string[];
  status: GameStatus;
  alarm: AlarmSnapshot | null;
  sweeper: SweeperSnapshot | null;
  sweepers?: SweeperSnapshot[];
};

export type RoundOutcome = {
  humanWon: boolean;
  duration: number;
  humanCollected: number;
  requiredItems: number;
  botCollections: number;
  taskTitle: string;
  reason: "scored" | "timeout";
};

export type ReplayRecording = {
  snapshots: ReplaySnapshot[];
  duration: number;
  humanActorId: string;
  requiredItems: number;
  task: RoundTask;
  outcome: RoundOutcome;
  map: MapLayer;
};
