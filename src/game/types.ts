export type GamePhase =
  | "title"
  | "hide"
  | "invalid-run"
  | "handoff"
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

export type ActorKind = "human" | "bot";

export type BotPersonality =
  | "Wanderer"
  | "Task-focused"
  | "Hesitant"
  | "Curious"
  | "Looper"
  | "Efficient"
  | "Distracted";

export type BotTargetKind = "item" | "exit" | "wander" | "actor" | "decor" | "loop";

export type BotBrain = {
  personality: BotPersonality;
  target: Vector;
  targetKind: BotTargetKind;
  targetActorId?: string;
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
};

export type ActorSnapshot = {
  id: string;
  label: number;
  x: number;
  y: number;
  heading: number;
  collected: number;
  bot?: BotDebugSnapshot;
};

export type BotDebugSnapshot = {
  personality: BotPersonality;
  targetKind: BotTargetKind;
  state: "seeking" | "pathing" | "paused" | "unsticking";
  target: Vector;
  finalTarget: Vector;
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
  status: GameStatus;
};

export type RoundOutcome = {
  humanWon: boolean;
  duration: number;
  humanCollected: number;
  requiredItems: number;
  botCollections: number;
  reason: "scored" | "timeout";
};

export type ReplayRecording = {
  snapshots: ReplaySnapshot[];
  duration: number;
  humanActorId: string;
  requiredItems: number;
  outcome: RoundOutcome;
  map: MapLayer;
};
