import { useEffect, useMemo, useRef, useState } from "react";
import facilityMapUrl from "../assets/facility-map.png";
import { createBotDebugSnapshot } from "../game/replay";
import {
  ACTOR_RADIUS,
  ACTOR_SPRITE_SIZE,
  COLORS,
  GAME_HEIGHT,
  GAME_WIDTH,
  ITEM_RADIUS,
  ROBOT_SPRITE_ROTATION_OFFSET,
} from "../game/constants";
import type {
  ActorSnapshot,
  GameState,
  MapLayer,
  Rect,
  ReplayRecording,
  ReplaySnapshot,
  Vector,
} from "../game/types";

type GameCanvasProps =
  | {
      mode: "hide";
      state: GameState;
      selectedActorId?: string | null;
      guessActorId?: string | null;
      humanActorId?: string | null;
      reveal?: boolean;
      trailPoints?: Vector[];
      debugOverlay?: boolean;
      showNumberBadges?: boolean;
      onActorClick?: (actorId: string) => void;
    }
  | {
      mode: "replay" | "results";
      recording: ReplayRecording;
      frame: ReplaySnapshot;
      selectedActorId?: string | null;
      guessActorId?: string | null;
      humanActorId?: string | null;
      reveal?: boolean;
      trailPoints?: Vector[];
      debugOverlay?: boolean;
      showNumberBadges?: boolean;
      onActorClick?: (actorId: string) => void;
    };

export default function GameCanvas(props: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);
  const [robotImage, setRobotImage] = useState<HTMLImageElement | null>(null);
  const map = props.mode === "hide" ? props.state.mapLayer : props.recording.map;
  const frame = useMemo(() => {
    if (props.mode !== "hide") {
      return props.frame;
    }

    return {
      timestamp: props.state.timeElapsed,
      actors: props.state.actors.map((actor) => ({
        id: actor.id,
        label: actor.label,
        x: actor.position.x,
        y: actor.position.y,
        heading: actor.heading,
        collected: actor.collected,
        bot: createBotDebugSnapshot(actor),
      })),
      items: props.state.items.map((item) => ({
        id: item.id,
        x: item.position.x,
        y: item.position.y,
        active: item.active,
      })),
      humanCollected: props.state.humanCollected,
      objectiveReady: props.state.humanCollected >= props.state.requiredItems,
      status: props.state.status,
    };
  }, [props]);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setMapImage(image);
      }
    };
    image.src = facilityMapUrl;

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setRobotImage(image);
      }
    };
    image.src = "/assets/robot.png";

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = GAME_WIDTH * devicePixelRatio;
    canvas.height = GAME_HEIGHT * devicePixelRatio;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    drawGame(context, {
      frame,
      map,
      mapImage,
      robotImage,
      mode: props.mode,
      selectedActorId: props.selectedActorId ?? null,
      guessActorId: props.guessActorId ?? null,
      humanActorId: props.humanActorId ?? null,
      reveal: props.reveal ?? false,
      trailPoints: props.trailPoints ?? [],
      debugOverlay: props.debugOverlay ?? false,
      showNumberBadges: props.showNumberBadges ?? false,
    });
  }, [
    frame,
    map,
    mapImage,
    robotImage,
    props.debugOverlay,
    props.guessActorId,
    props.humanActorId,
    props.reveal,
    props.selectedActorId,
    props.showNumberBadges,
    props.trailPoints,
  ]);

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!props.onActorClick) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const point = {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
    const hitRadius = Math.max(ACTOR_RADIUS + 12, ACTOR_SPRITE_SIZE * 0.75);
    const hit = [...frame.actors]
      .sort((a, b) => distanceToActor(point, a) - distanceToActor(point, b))
      .find((actor) => isActorVisibleForSelection(actor, map, props.mode) && distanceToActor(point, actor) <= hitRadius);

    if (hit) {
      props.onActorClick(hit.id);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className={`game-canvas ${props.onActorClick ? "game-canvas--clickable" : ""}`}
      width={GAME_WIDTH}
      height={GAME_HEIGHT}
      aria-label="Top-down game area"
      onPointerDown={handlePointerDown}
    />
  );
}

function drawGame(
  context: CanvasRenderingContext2D,
  options: {
    frame: ReplaySnapshot;
    map: MapLayer;
    mapImage: HTMLImageElement | null;
    robotImage: HTMLImageElement | null;
    mode: "hide" | "replay" | "results";
    selectedActorId: string | null;
    guessActorId: string | null;
    humanActorId: string | null;
    reveal: boolean;
    trailPoints: Vector[];
    debugOverlay: boolean;
    showNumberBadges: boolean;
  },
) {
  context.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawBackground(context, options.mapImage);
  if (options.debugOverlay) {
    drawDebugOverlay(context, options.map, options.frame);
  }
  drawItems(context, options.frame);
  drawTrail(context, options.trailPoints, options.map);
  drawActors(context, options);
  drawNumberBadges(context, options);
  drawForegroundOcclusion(context, options.map);
}

function drawBackground(context: CanvasRenderingContext2D, image: HTMLImageElement | null) {
  if (image?.complete && image.naturalWidth > 0) {
    drawImageCover(context, image);
    return;
  }

  context.fillStyle = COLORS.floor;
  context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  context.strokeStyle = COLORS.floorGrid;
  context.lineWidth = 1;
  for (let x = 32; x < GAME_WIDTH; x += 32) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, GAME_HEIGHT);
    context.stroke();
  }

  for (let y = 32; y < GAME_HEIGHT; y += 32) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(GAME_WIDTH, y);
    context.stroke();
  }

  context.strokeStyle = COLORS.floorGridMajor;
  for (let x = 160; x < GAME_WIDTH; x += 160) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, GAME_HEIGHT);
    context.stroke();
  }

  for (let y = 160; y < GAME_HEIGHT; y += 160) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(GAME_WIDTH, y);
    context.stroke();
  }
}

function drawItems(context: CanvasRenderingContext2D, frame: ReplaySnapshot) {
  for (const [index, item] of frame.items.entries()) {
    if (!item.active) {
      continue;
    }

    const pulse = glowPulse(frame.timestamp, index * 0.19);
    const glowRadius = ITEM_RADIUS + 7 + pulse * 3;

    context.fillStyle = COLORS.itemGlow;
    context.beginPath();
    context.arc(item.x, item.y, glowRadius, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = COLORS.item;
    context.beginPath();
    context.arc(item.x, item.y, ITEM_RADIUS, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "rgba(255, 255, 255, 0.8)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(item.x, item.y, ITEM_RADIUS + 1.5, 0, Math.PI * 2);
    context.stroke();
  }
}

function drawDebugOverlay(context: CanvasRenderingContext2D, map: MapLayer, frame: ReplaySnapshot) {
  context.save();

  for (const rect of map.collisionRects) {
    context.fillStyle = "rgba(220, 48, 48, 0.28)";
    context.strokeStyle = "rgba(180, 22, 22, 0.78)";
    context.lineWidth = 2;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }

  for (const walkway of map.movingWalkways) {
    const { rect } = walkway;
    context.fillStyle = "rgba(18, 184, 220, 0.24)";
    context.strokeStyle = "rgba(5, 132, 162, 0.9)";
    context.lineWidth = 3;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);

    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.lineWidth = 4;
    context.lineCap = "round";
    const centerY = rect.y + rect.height / 2;
    const arrowCount = 4;
    for (let index = 0; index < arrowCount; index += 1) {
      const t = (index + 0.5) / arrowCount;
      const centerX = rect.x + rect.width * t;
      const sign = walkway.direction.x >= 0 ? 1 : -1;
      context.beginPath();
      context.moveTo(centerX - sign * 14, centerY - 10);
      context.lineTo(centerX + sign * 14, centerY);
      context.lineTo(centerX - sign * 14, centerY + 10);
      context.stroke();
    }
  }

  context.fillStyle = "rgba(255, 211, 67, 0.28)";
  context.strokeStyle = "rgba(214, 154, 22, 0.92)";
  context.lineWidth = 3;
  context.fillRect(map.exit.x, map.exit.y, map.exit.width, map.exit.height);
  context.strokeRect(map.exit.x, map.exit.y, map.exit.width, map.exit.height);

  for (const point of map.botWaypoints) {
    context.fillStyle = "rgba(44, 185, 92, 0.92)";
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fill();
  }

  for (const point of map.itemSpawnPoints) {
    context.fillStyle = "rgba(38, 116, 232, 0.92)";
    context.beginPath();
    context.arc(point.x, point.y, 6, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(255, 255, 255, 0.86)";
    context.lineWidth = 1.5;
    context.stroke();
  }

  drawBotDebugOverlay(context, frame);
  context.restore();
}

function drawBotDebugOverlay(context: CanvasRenderingContext2D, frame: ReplaySnapshot) {
  context.save();
  context.font = "700 10px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const actor of frame.actors) {
    const bot = actor.bot;
    if (!bot) {
      continue;
    }

    const color = botDebugColor(bot.targetKind, bot.state);
    const remainingPath = bot.path.slice(bot.pathIndex);
    const path = [{ x: actor.x, y: actor.y }, ...remainingPath];

    if (path.length > 1) {
      context.strokeStyle = color;
      context.lineWidth = bot.state === "unsticking" ? 3 : 2;
      context.setLineDash(bot.state === "paused" ? [4, 5] : [8, 6]);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(path[0].x, path[0].y);
      for (const point of path.slice(1)) {
        context.lineTo(point.x, point.y);
      }
      context.stroke();
      context.setLineDash([]);
    }

    drawDebugTarget(context, bot.finalTarget, color, bot.targetKind === "item" ? 8 : 6);
    if (distanceBetween(bot.target, bot.finalTarget) > 8) {
      drawDebugTarget(context, bot.target, "rgba(255, 255, 255, 0.86)", 4);
    }

    drawBotDebugLabel(context, actor.x, actor.y + ACTOR_SPRITE_SIZE * 0.72 + 13, {
      color,
      text: `${actor.label} ${shortTargetKind(bot.targetKind)} ${shortZone(
        bot.roamZone ?? bot.targetZone,
      )} ${actor.collected}/${bot.pointQuota}`,
      state: bot.state,
    });
  }

  context.restore();
}

function drawDebugTarget(
  context: CanvasRenderingContext2D,
  point: Vector,
  color: string,
  radius: number,
) {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = "rgba(255, 255, 255, 0.78)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(point.x - radius - 4, point.y);
  context.lineTo(point.x + radius + 4, point.y);
  context.moveTo(point.x, point.y - radius - 4);
  context.lineTo(point.x, point.y + radius + 4);
  context.stroke();
  context.restore();
}

function drawBotDebugLabel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  options: {
    color: string;
    text: string;
    state: string;
  },
) {
  const width = Math.max(50, context.measureText(options.text).width + 14);
  const height = 18;

  context.save();
  context.fillStyle = options.state === "unsticking" ? "rgba(96, 20, 20, 0.82)" : "rgba(17, 30, 37, 0.78)";
  roundRect(context, x - width / 2, y - height / 2, width, height, 5);
  context.fill();
  context.strokeStyle = options.color;
  context.lineWidth = 1.4;
  context.stroke();
  context.fillStyle = "rgba(255, 255, 255, 0.94)";
  context.fillText(options.text, x, y + 0.5);
  context.restore();
}

function botDebugColor(targetKind: string, state: string): string {
  if (state === "unsticking") {
    return "rgba(241, 92, 92, 0.96)";
  }

  if (state === "paused") {
    return "rgba(255, 255, 255, 0.88)";
  }

  switch (targetKind) {
    case "item":
      return "rgba(52, 138, 244, 0.96)";
    case "decor":
      return "rgba(244, 174, 52, 0.96)";
    case "actor":
      return "rgba(223, 120, 214, 0.94)";
    case "loop":
      return "rgba(71, 197, 116, 0.94)";
    case "exit":
      return "rgba(255, 211, 67, 0.96)";
    default:
      return "rgba(51, 205, 207, 0.94)";
  }
}

function shortTargetKind(targetKind: string): string {
  switch (targetKind) {
    case "item":
      return "itm";
    case "decor":
      return "dec";
    case "actor":
      return "act";
    case "loop":
      return "lop";
    case "exit":
      return "ext";
    default:
      return "wnd";
  }
}

function shortZone(zone?: string): string {
  switch (zone) {
    case "upperLeftLounge":
      return "UL";
    case "upperRightLab":
      return "UR";
    case "lowerLeftOffice":
      return "LL";
    case "lowerRightStorage":
      return "LR";
    case "mainFloor":
      return "MF";
    default:
      return "--";
  }
}

function drawTrail(context: CanvasRenderingContext2D, points: Vector[], map: MapLayer) {
  if (points.length < 2) {
    return;
  }

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (isPointUnderCover(previous, map) || isPointUnderCover(current, map)) {
      continue;
    }

    const age = index / (points.length - 1);

    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(current.x, current.y);
    context.strokeStyle = `rgba(216, 144, 31, ${0.12 + age * 0.48})`;
    context.lineWidth = 3 + age * 2;
    context.stroke();
  }

  for (let index = 0; index < points.length; index += 12) {
    const point = points[index];
    if (isPointUnderCover(point, map)) {
      continue;
    }

    const age = index / Math.max(1, points.length - 1);
    context.fillStyle = `rgba(216, 144, 31, ${0.14 + age * 0.36})`;
    context.beginPath();
    context.arc(point.x, point.y, 2.2 + age * 1.6, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawActors(
  context: CanvasRenderingContext2D,
  options: {
    frame: ReplaySnapshot;
    map: MapLayer;
    robotImage: HTMLImageElement | null;
    selectedActorId: string | null;
    guessActorId: string | null;
    humanActorId: string | null;
    reveal: boolean;
  },
) {
  const ordered = [...options.frame.actors].sort((a, b) => a.y - b.y);

  for (const actor of ordered) {
    const isSelected = actor.id === options.selectedActorId;
    const isGuess = actor.id === options.guessActorId;
    const isHuman = actor.id === options.humanActorId;
    const isCovered = isActorUnderCover(actor, options.map);

    if (isCovered && !options.reveal) {
      continue;
    }

    drawActorHighlight(context, actor, {
      isSelected,
      isGuess,
      isHuman,
      reveal: options.reveal,
    });
    drawRobotSprite(context, actor, options.robotImage, 1);
  }
}

function drawActorHighlight(
  context: CanvasRenderingContext2D,
  actor: ActorSnapshot,
  state: {
    isSelected: boolean;
    isGuess: boolean;
    isHuman: boolean;
    reveal: boolean;
  },
) {
  const baseRadius = ACTOR_SPRITE_SIZE * 0.62;

  if (state.reveal && state.isGuess && state.isHuman) {
    drawRing(context, actor.x, actor.y, baseRadius + 8, COLORS.human, 5, "rgba(243, 165, 29, 0.32)");
    return;
  }

  if (state.reveal && state.isHuman) {
    drawRing(context, actor.x, actor.y, baseRadius + 8, COLORS.human, 5);
  }

  if (state.reveal && state.isGuess && !state.isHuman) {
    drawRing(context, actor.x, actor.y, baseRadius + 13, COLORS.wrong, 4);
    return;
  }

  if (!state.reveal && state.isSelected) {
    drawRing(context, actor.x, actor.y, baseRadius + 8, COLORS.selected, 3);
  }
}

function drawRing(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  lineWidth: number,
  glow?: string,
) {
  context.save();
  if (glow) {
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, radius + 6, 0, Math.PI * 2);
    context.fill();
  }

  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawRobotSprite(
  context: CanvasRenderingContext2D,
  actor: ActorSnapshot,
  image: HTMLImageElement | null,
  opacity: number,
) {
  const width = ACTOR_SPRITE_SIZE;
  const height = image?.naturalWidth ? width * (image.naturalHeight / image.naturalWidth) : width;

  context.save();
  context.globalAlpha = opacity;
  context.translate(actor.x, actor.y);
  context.rotate(actor.heading + ROBOT_SPRITE_ROTATION_OFFSET);
  context.imageSmoothingEnabled = true;

  if (image?.complete && image.naturalWidth > 0) {
    context.drawImage(image, -width / 2, -height / 2, width, height);
  } else {
    context.fillStyle = COLORS.actorFill;
    context.strokeStyle = COLORS.actorStroke;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, ACTOR_RADIUS, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  context.restore();
}

function drawNumberBadges(
  context: CanvasRenderingContext2D,
  options: {
    frame: ReplaySnapshot;
    map: MapLayer;
    mode: "hide" | "replay" | "results";
    reveal: boolean;
    showNumberBadges: boolean;
  },
) {
  if (options.mode === "replay") {
    return;
  }

  if (options.mode === "hide" && !options.showNumberBadges) {
    return;
  }

  const ordered = [...options.frame.actors].sort((a, b) => a.y - b.y);

  for (const actor of ordered) {
    const isCovered = isActorUnderCover(actor, options.map);
    if (isCovered && !options.showNumberBadges && !options.reveal) {
      continue;
    }

    const x = actor.x;
    const y = actor.y - ACTOR_SPRITE_SIZE * 0.6 - 10;

    context.save();
    context.fillStyle = "rgba(255, 255, 255, 0.94)";
    context.strokeStyle = COLORS.actorStroke;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, 9.5, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = COLORS.actorText;
    context.font = "700 10px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(actor.label), x, y + 0.5);
    context.restore();
  }
}

function drawForegroundOcclusion(context: CanvasRenderingContext2D, map: MapLayer) {
  for (const zone of map.coverZones) {
    const gradient = context.createRadialGradient(
      zone.center.x,
      zone.center.y,
      zone.radius * 0.24,
      zone.center.x,
      zone.center.y,
      zone.radius,
    );
    gradient.addColorStop(0, "rgba(86, 125, 54, 0.2)");
    gradient.addColorStop(0.62, "rgba(86, 125, 54, 0.12)");
    gradient.addColorStop(1, "rgba(86, 125, 54, 0)");

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(zone.center.x, zone.center.y, zone.radius, 0, Math.PI * 2);
    context.fill();
  }
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function distanceToActor(point: { x: number; y: number }, actor: ActorSnapshot): number {
  return Math.hypot(point.x - actor.x, point.y - actor.y);
}

function distanceBetween(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isActorUnderCover(actor: ActorSnapshot, map: MapLayer): boolean {
  return isPointUnderCover(actor, map);
}

function isActorVisibleForSelection(actor: ActorSnapshot, map: MapLayer, mode: GameCanvasProps["mode"]): boolean {
  return mode === "results" || !isActorUnderCover(actor, map);
}

function isPointUnderCover(point: Vector, map: MapLayer): boolean {
  return map.coverZones.some(
    (zone) => Math.hypot(point.x - zone.center.x, point.y - zone.center.y) <= zone.radius,
  );
}

function drawImageCover(context: CanvasRenderingContext2D, image: HTMLImageElement) {
  const scale = Math.max(GAME_WIDTH / image.naturalWidth, GAME_HEIGHT / image.naturalHeight);
  const sourceWidth = GAME_WIDTH / scale;
  const sourceHeight = GAME_HEIGHT / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    GAME_WIDTH,
    GAME_HEIGHT,
  );
}

function glowPulse(time: number, offset: number): number {
  return (Math.sin(time * 4.2 + offset) + 1) * 0.5;
}
