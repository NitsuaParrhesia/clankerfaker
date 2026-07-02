import type {
  BotNavigationNode,
  CoverZone,
  DecorPoint,
  MapLayer,
  MapZone,
  MovingWalkway,
  Rect,
  Vector,
} from "./types";

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 960;
export const ACTOR_COUNT = 11;
export const BOT_COUNT = 10;
export const ACTOR_RADIUS = 15;
export const ITEM_RADIUS = 7;
export const ITEM_COUNT = 15;
export const REQUIRED_ITEMS = 3;
export const ROUND_DURATION = 45;
export const COUNTDOWN_SECONDS = 5;
export const SNAPSHOT_INTERVAL = 0.1;
export const HUMAN_SPEED = 112;
export const BOT_BASE_SPEED = 104;
export const ACTOR_SPRITE_SIZE = 34;
export const ROBOT_SPRITE_ROTATION_OFFSET = -Math.PI / 2;
export const ACTOR_HEADING_TURN_RATE = 7.8;
export const BOT_HEADING_TURN_RATE = 5.2;

export const OUTER_WALLS: Rect[] = [
  { x: 0, y: 0, width: 960, height: 34 },
  { x: 0, y: 926, width: 960, height: 34 },
  { x: 0, y: 0, width: 34, height: 960 },
  { x: 926, y: 0, width: 34, height: 960 },
];

export const INTERIOR_WALLS: Rect[] = [
  { x: 572, y: 34, width: 28, height: 246 },
  { x: 600, y: 232, width: 112, height: 28 },
  { x: 774, y: 232, width: 152, height: 28 },
  { x: 206, y: 720, width: 28, height: 82 },
  { x: 206, y: 856, width: 28, height: 30 },
  { x: 234, y: 720, width: 38, height: 28 },
  { x: 234, y: 748, width: 38, height: 178 },
  { x: 34, y: 856, width: 200, height: 28 },
  { x: 666, y: 720, width: 28, height: 206 },
  { x: 666, y: 720, width: 82, height: 28 },
];

export const DOORWAY_GAPS: Rect[] = [
  { x: 422, y: 0, width: 112, height: 46 },
  { x: 422, y: 926, width: 112, height: 34 },
  { x: 712, y: 232, width: 62, height: 28 },
  { x: 150, y: 686, width: 116, height: 34 },
  { x: 744, y: 686, width: 84, height: 34 },
];

export const OBSTACLE_RECTS: Rect[] = [
  { x: 50, y: 74, width: 31, height: 36 },
  { x: 96, y: 54, width: 242, height: 48 },
  { x: 103, y: 139, width: 164, height: 48 },
  { x: 348, y: 132, width: 28, height: 139 },
  { x: 51, y: 229, width: 27, height: 22 },
  { x: 93, y: 227, width: 68, height: 42 },
  { x: 167, y: 237, width: 36, height: 33 },
  { x: 208, y: 224, width: 69, height: 46 },
  { x: 427, y: 286, width: 83, height: 62 },
  { x: 126, y: 348, width: 33, height: 100 },
  { x: 800, y: 348, width: 28, height: 102 },
  { x: 126, y: 515, width: 33, height: 41 },
  { x: 798, y: 518, width: 34, height: 38 },
  { x: 125, y: 599, width: 36, height: 69 },
  { x: 320, y: 599, width: 41, height: 70 },
  { x: 566, y: 604, width: 38, height: 66 },
  { x: 755, y: 622, width: 87, height: 43 },
  { x: 605, y: 65, width: 35, height: 79 },
  { x: 684, y: 57, width: 161, height: 64 },
  { x: 844, y: 56, width: 75, height: 55 },
  { x: 868, y: 109, width: 49, height: 34 },
  { x: 608, y: 201, width: 28, height: 29 },
  { x: 841, y: 184, width: 77, height: 51 },
  { x: 42, y: 726, width: 41, height: 176 },
  { x: 82, y: 823, width: 120, height: 80 },
  { x: 384, y: 744, width: 35, height: 35 },
  { x: 528, y: 743, width: 39, height: 38 },
  { x: 815, y: 729, width: 93, height: 132 },
  { x: 876, y: 866, width: 40, height: 38 },
  { x: 554, y: 877, width: 31, height: 26 },
];

export const MOVING_WALKWAYS: MovingWalkway[] = [
  {
    id: "upper-walkway",
    rect: { x: 246, y: 406, width: 470, height: 54 },
    direction: { x: 1, y: 0 },
    speed: 118,
  },
  {
    id: "lower-walkway",
    rect: { x: 246, y: 508, width: 470, height: 54 },
    direction: { x: -1, y: 0 },
    speed: 118,
  },
];

export const ITEM_SPAWN_POINTS: Vector[] = [
  { x: 92, y: 318 },
  { x: 210, y: 332 },
  { x: 350, y: 328 },
  { x: 544, y: 334 },
  { x: 782, y: 336 },
  { x: 845, y: 522 },
  { x: 360, y: 586 },
  { x: 528, y: 600 },
  { x: 150, y: 706 },
  { x: 326, y: 826 },
  { x: 550, y: 822 },
  { x: 760, y: 856 },
  { x: 680, y: 132 },
  { x: 826, y: 176 },
  { x: 462, y: 258 },
];

export const MAP_ZONES: MapZone[] = [
  { id: "upperLeftLounge", bounds: { x: 54, y: 58, width: 470, height: 250 }, roamWeight: 1.14 },
  { id: "upperRightLab", bounds: { x: 612, y: 58, width: 292, height: 168 }, roamWeight: 1.08 },
  { id: "lowerLeftOffice", bounds: { x: 54, y: 724, width: 150, height: 180 }, roamWeight: 0.86 },
  { id: "lowerRightStorage", bounds: { x: 704, y: 724, width: 190, height: 180 }, roamWeight: 0.86 },
  { id: "mainFloor", bounds: { x: 74, y: 300, width: 812, height: 574 }, roamWeight: 1.28 },
  { id: "walkwayLane", bounds: { x: 230, y: 382, width: 500, height: 190 }, roamWeight: 0.08 },
];

export const BOT_NAVIGATION_NODES: BotNavigationNode[] = [
  {
    id: "upper-left-table",
    position: { x: 302, y: 194 },
    zone: "upperLeftLounge",
    kind: "roam",
    links: ["upper-left-door"],
  },
  {
    id: "upper-left-west",
    position: { x: 102, y: 328 },
    zone: "upperLeftLounge",
    kind: "roam",
    links: ["upper-left-door", "main-west-north"],
  },
  {
    id: "upper-left-door",
    position: { x: 304, y: 326 },
    zone: "upperLeftLounge",
    kind: "doorway",
    links: ["upper-left-table", "upper-left-west", "tree-west"],
  },
  {
    id: "upper-left-east-pocket",
    position: { x: 408, y: 232 },
    zone: "upperLeftLounge",
    kind: "transit",
    links: ["tree-hideout", "tree-west"],
  },
  {
    id: "tree-hideout",
    position: { x: 462, y: 258 },
    zone: "upperLeftLounge",
    kind: "roam",
    links: ["upper-left-east-pocket"],
  },
  {
    id: "main-west-north",
    position: { x: 104, y: 462 },
    zone: "mainFloor",
    kind: "transit",
    links: ["upper-left-west", "main-west"],
  },
  {
    id: "tree-west",
    position: { x: 388, y: 378 },
    zone: "mainFloor",
    kind: "transit",
    links: ["upper-left-door", "upper-left-east-pocket", "main-north"],
  },
  {
    id: "upper-right-entry-main",
    position: { x: 744, y: 286 },
    zone: "mainFloor",
    kind: "doorway",
    links: ["upper-right-entry-lab", "main-north", "main-east"],
  },
  {
    id: "upper-right-entry-lab",
    position: { x: 744, y: 198 },
    zone: "upperRightLab",
    kind: "doorway",
    links: ["upper-right-entry-main", "upper-right-workbench", "upper-right-east"],
  },
  {
    id: "upper-right-workbench",
    position: { x: 690, y: 144 },
    zone: "upperRightLab",
    kind: "roam",
    links: ["upper-right-entry-lab", "upper-right-east"],
  },
  {
    id: "upper-right-east",
    position: { x: 808, y: 178 },
    zone: "upperRightLab",
    kind: "roam",
    links: ["upper-right-entry-lab", "upper-right-workbench"],
  },
  {
    id: "main-north",
    position: { x: 536, y: 378 },
    zone: "mainFloor",
    kind: "transit",
    links: ["tree-west", "upper-right-entry-main", "main-center", "main-west", "main-east"],
  },
  {
    id: "main-west",
    position: { x: 210, y: 520 },
    zone: "mainFloor",
    kind: "transit",
    links: ["main-west-north", "main-north", "main-center", "walkway-upper-left", "walkway-lower-left"],
  },
  {
    id: "main-center",
    position: { x: 500, y: 580 },
    zone: "mainFloor",
    kind: "transit",
    links: ["main-north", "main-west", "main-east", "main-lower-center", "walkway-upper-mid", "walkway-lower-mid"],
  },
  {
    id: "main-east",
    position: { x: 760, y: 516 },
    zone: "mainFloor",
    kind: "transit",
    links: ["upper-right-entry-main", "main-north", "main-center", "main-south-east", "walkway-upper-right", "walkway-lower-right"],
  },
  {
    id: "main-lower-center",
    position: { x: 500, y: 680 },
    zone: "mainFloor",
    kind: "transit",
    links: ["main-center", "main-south-west", "main-south-east"],
  },
  {
    id: "main-south-west",
    position: { x: 320, y: 700 },
    zone: "mainFloor",
    kind: "transit",
    links: ["main-lower-center", "lower-left-entry"],
  },
  {
    id: "main-south-east",
    position: { x: 614, y: 700 },
    zone: "mainFloor",
    kind: "transit",
    links: ["main-lower-center", "main-east", "lower-right-entry"],
  },
  {
    id: "lower-left-entry",
    position: { x: 180, y: 700 },
    zone: "mainFloor",
    kind: "doorway",
    links: ["main-south-west", "lower-left-inner"],
  },
  {
    id: "lower-left-inner",
    position: { x: 168, y: 780 },
    zone: "lowerLeftOffice",
    kind: "roam",
    links: ["lower-left-entry"],
  },
  {
    id: "lower-right-entry",
    position: { x: 786, y: 700 },
    zone: "mainFloor",
    kind: "doorway",
    links: ["main-south-east", "lower-right-inner"],
  },
  {
    id: "lower-right-inner",
    position: { x: 772, y: 848 },
    zone: "lowerRightStorage",
    kind: "roam",
    links: ["lower-right-entry"],
  },
  {
    id: "walkway-upper-left",
    position: { x: 318, y: 433 },
    zone: "walkwayLane",
    kind: "walkway",
    links: ["main-west", "walkway-upper-mid"],
  },
  {
    id: "walkway-upper-mid",
    position: { x: 500, y: 433 },
    zone: "walkwayLane",
    kind: "walkway",
    links: ["walkway-upper-left", "walkway-upper-right", "main-center"],
  },
  {
    id: "walkway-upper-right",
    position: { x: 652, y: 433 },
    zone: "walkwayLane",
    kind: "walkway",
    links: ["walkway-upper-mid", "main-east"],
  },
  {
    id: "walkway-lower-left",
    position: { x: 318, y: 535 },
    zone: "walkwayLane",
    kind: "walkway",
    links: ["main-west", "walkway-lower-mid"],
  },
  {
    id: "walkway-lower-mid",
    position: { x: 500, y: 535 },
    zone: "walkwayLane",
    kind: "walkway",
    links: ["walkway-lower-left", "walkway-lower-right", "main-center"],
  },
  {
    id: "walkway-lower-right",
    position: { x: 652, y: 535 },
    zone: "walkwayLane",
    kind: "walkway",
    links: ["walkway-lower-mid", "main-east"],
  },
];

export const BOT_WAYPOINTS: Vector[] = BOT_NAVIGATION_NODES.map((node) => node.position);

export const EXIT_ZONE: Rect = {
  x: 426,
  y: 898,
  width: 108,
  height: 46,
};

export const DECOR_POINTS: DecorPoint[] = [
  { id: "tree-hideout", position: { x: 462, y: 258 }, radius: 26 },
  { id: "station-1", position: { x: 680, y: 132 }, radius: 18 },
  { id: "station-2", position: { x: 826, y: 176 }, radius: 16 },
  { id: "station-3", position: { x: 150, y: 706 }, radius: 18 },
  { id: "station-4", position: { x: 812, y: 856 }, radius: 20 },
  { id: "station-5", position: { x: 326, y: 826 }, radius: 16 },
  { id: "station-6", position: { x: 550, y: 822 }, radius: 16 },
];

export const COVER_ZONES: CoverZone[] = [
  { id: "central-tree-canopy", center: { x: 466, y: 293 }, radius: 66 },
];

export const COLLISION_RECTS: Rect[] = [
  ...OUTER_WALLS,
  ...INTERIOR_WALLS,
  ...OBSTACLE_RECTS,
];

export const MAP_LAYER: MapLayer = {
  outerWalls: OUTER_WALLS,
  interiorWalls: INTERIOR_WALLS,
  doorwayGaps: DOORWAY_GAPS,
  obstacleRects: OBSTACLE_RECTS,
  movingWalkways: MOVING_WALKWAYS,
  collisionRects: COLLISION_RECTS,
  itemSpawnPoints: ITEM_SPAWN_POINTS,
  botWaypoints: BOT_WAYPOINTS,
  zones: MAP_ZONES,
  botNavigationNodes: BOT_NAVIGATION_NODES,
  exit: EXIT_ZONE,
  decor: DECOR_POINTS,
  coverZones: COVER_ZONES,
};

export const OBSTACLES: Rect[] = COLLISION_RECTS;

export const COLORS = {
  ink: "#172026",
  muted: "#65737a",
  floor: "#edf1f3",
  floorGrid: "#d5dde1",
  floorGridMajor: "#c4cdd3",
  wall: "#2f3d46",
  wallEdge: "#18242b",
  wallHighlight: "#465560",
  actorFill: "#fbfcfb",
  actorStroke: "#20303a",
  actorText: "#20303a",
  item: "#2674e8",
  itemGlow: "rgba(38, 116, 232, 0.22)",
  interactable: "#f3a51d",
  interactableFill: "rgba(243, 165, 29, 0.16)",
  interactableGlow: "rgba(255, 198, 74, 0.24)",
  selected: "#df8f1f",
  human: "#1f8f5f",
  wrong: "#d34d4d",
  decor: "#f3a51d",
};
