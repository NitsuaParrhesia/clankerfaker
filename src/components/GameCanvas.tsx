import { useEffect, useMemo, useRef, useState } from "react";
import facilityMapUrl from "../assets/facility-map.png";
import { createSnapshot } from "../game/replay";
import {
  ACTOR_RADIUS,
  ACTOR_SPRITE_SIZE,
  COLORS,
  GAME_HEIGHT,
  GAME_WIDTH,
  ITEM_RADIUS,
  ITEM_SPRITE_SIZE,
  ROBOT_SPRITE_ROTATION_OFFSET,
  SWEEPER_RADIUS,
  SWEEPER_SPRITE_ROTATION_OFFSET,
  SWEEPER_SPRITE_SIZE,
} from "../game/constants";
import type {
  ActorSnapshot,
  GameState,
  MapLayer,
  Rect,
  ReplayRecording,
  ReplaySnapshot,
  RoundTask,
  TaskStep,
  Vector,
} from "../game/types";

const ALARM_LIGHT_SPRITE_SIZE = 44;
const STUN_SPRITE_FRAME_SIZE = 512;
const STUN_SPRITE_FRAME_COUNT = 5;
const STUN_SPRITE_FRAME_RATE = 12;
const STUN_EFFECT_DRAW_SIZE = 78;
const POP_SPRITE_FRAME_SIZE = 444;
const POP_SPRITE_FRAME_COUNT = 8;
const POP_EFFECT_START_PROGRESS = 0.76;
const POP_EFFECT_DRAW_SIZE = 104;
const RESPAWN_SPRITE_FRAME_SIZE = 512;
const RESPAWN_SPRITE_FRAME_COUNT = 6;
const RESPAWN_EFFECT_DRAW_SIZE = 118;

type AlarmLightImages = {
  off: HTMLImageElement | null;
  on: HTMLImageElement | null;
  glow: HTMLImageElement | null;
};

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
      countdownHighlightActorId?: string | null;
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
      countdownHighlightActorId?: string | null;
      onActorClick?: (actorId: string) => void;
    };

export default function GameCanvas(props: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);
  const [robotImage, setRobotImage] = useState<HTMLImageElement | null>(null);
  const [sweeperImage, setSweeperImage] = useState<HTMLImageElement | null>(null);
  const [itemImage, setItemImage] = useState<HTMLImageElement | null>(null);
  const [stunImage, setStunImage] = useState<HTMLImageElement | null>(null);
  const [popImage, setPopImage] = useState<HTMLImageElement | null>(null);
  const [respawnImage, setRespawnImage] = useState<HTMLImageElement | null>(null);
  const [alarmLightOffImage, setAlarmLightOffImage] = useState<HTMLImageElement | null>(null);
  const [alarmLightOnImage, setAlarmLightOnImage] = useState<HTMLImageElement | null>(null);
  const [alarmLightGlowImage, setAlarmLightGlowImage] = useState<HTMLImageElement | null>(null);
  const map = props.mode === "hide" ? props.state.mapLayer : props.recording.map;
  const task = props.mode === "hide" ? props.state.task : props.recording.task;
  const frame = useMemo(() => {
    if (props.mode !== "hide") {
      return props.frame;
    }

    return createSnapshot(props.state);
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
        setItemImage(image);
      }
    };
    image.src = "/assets/token.png";

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setRespawnImage(image);
      }
    };
    image.src = "/assets/clanker-respawn-sprite.png?v=2";

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setStunImage(image);
      }
    };
    image.src = "/assets/clanker-stun-sprite.png?v=1";

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setPopImage(image);
      }
    };
    image.src = "/assets/clanker-pop-sprite.png";

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setAlarmLightOffImage(image);
      }
    };
    image.src = "/assets/red-alarm-light-off.png";

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setAlarmLightOnImage(image);
      }
    };
    image.src = "/assets/red-alarm-light-on.png";

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setAlarmLightGlowImage(image);
      }
    };
    image.src = "/assets/red-alarm-light-glow.png";

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
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setSweeperImage(image);
      }
    };
    image.src = "/assets/stun-bot.png";

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
      task,
      mapImage,
      robotImage,
      sweeperImage,
      itemImage,
      stunImage,
      popImage,
      respawnImage,
      alarmLightImages: {
        off: alarmLightOffImage,
        on: alarmLightOnImage,
        glow: alarmLightGlowImage,
      },
      mode: props.mode,
      selectedActorId: props.selectedActorId ?? null,
      guessActorId: props.guessActorId ?? null,
      humanActorId: props.humanActorId ?? null,
      reveal: props.reveal ?? false,
      trailPoints: props.trailPoints ?? [],
      debugOverlay: props.debugOverlay ?? false,
      showNumberBadges: props.showNumberBadges ?? false,
      countdownHighlightActorId: props.countdownHighlightActorId ?? null,
    });
  }, [
    frame,
    map,
    task,
    mapImage,
    robotImage,
    sweeperImage,
    itemImage,
    stunImage,
    popImage,
    respawnImage,
    alarmLightOffImage,
    alarmLightOnImage,
    alarmLightGlowImage,
    props.debugOverlay,
    props.guessActorId,
    props.humanActorId,
    props.reveal,
    props.selectedActorId,
    props.showNumberBadges,
    props.countdownHighlightActorId,
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
    task: RoundTask;
    mapImage: HTMLImageElement | null;
    robotImage: HTMLImageElement | null;
    sweeperImage: HTMLImageElement | null;
    itemImage: HTMLImageElement | null;
    stunImage: HTMLImageElement | null;
    popImage: HTMLImageElement | null;
    respawnImage: HTMLImageElement | null;
    alarmLightImages: AlarmLightImages;
    mode: "hide" | "replay" | "results";
    selectedActorId: string | null;
    guessActorId: string | null;
    humanActorId: string | null;
    reveal: boolean;
    trailPoints: Vector[];
    debugOverlay: boolean;
    showNumberBadges: boolean;
    countdownHighlightActorId: string | null;
  },
) {
  context.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawBackground(context, options.mapImage);
  if (options.debugOverlay) {
    drawDebugOverlay(context, options.map, options.frame);
  }
  drawAlarmLights(context, options.map, options.frame, options.alarmLightImages);
  if (options.mode === "hide") {
    drawTaskTargets(context, options.task, options.frame);
  }
  drawItems(context, options.frame, options.itemImage);
  drawTrail(context, options.trailPoints, options.map);
  drawActors(context, options);
  drawSweepers(context, options.frame, options.sweeperImage);
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

function drawItems(context: CanvasRenderingContext2D, frame: ReplaySnapshot, itemImage: HTMLImageElement | null) {
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

    if (itemImage?.complete && itemImage.naturalWidth > 0) {
      const bob = Math.sin(frame.timestamp * 5 + index * 0.73) * 1.2;
      context.save();
      context.translate(item.x, item.y + bob);
      context.shadowColor = "rgba(38, 116, 232, 0.32)";
      context.shadowBlur = 8 + pulse * 4;
      context.drawImage(
        itemImage,
        -ITEM_SPRITE_SIZE / 2,
        -ITEM_SPRITE_SIZE / 2,
        ITEM_SPRITE_SIZE,
        ITEM_SPRITE_SIZE,
      );
      context.restore();
      continue;
    }

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

function drawAlarmLights(
  context: CanvasRenderingContext2D,
  map: MapLayer,
  frame: ReplaySnapshot,
  images: AlarmLightImages,
) {
  const alarm = frame.alarm;

  if (alarm) {
    const borderPulse = (Math.sin(frame.timestamp * 22) + 1) * 0.5;
    const borderAlpha = alarm.phase === "active" ? 0.18 + borderPulse * 0.2 : 0.08 + borderPulse * 0.1;

    context.save();
    context.strokeStyle = `rgba(224, 45, 45, ${borderAlpha})`;
    context.lineWidth = alarm.phase === "active" ? 12 : 7;
    context.strokeRect(8, 8, GAME_WIDTH - 16, GAME_HEIGHT - 16);
    context.restore();
  }

  for (const light of map.alarmLights) {
    const isTriggered = alarm?.lightId === light.id;
    const blink = isTriggered ? (Math.sin(frame.timestamp * 24) + 1) * 0.5 : 0;
    const sprite = getAlarmLightSprite(images, isTriggered, alarm?.phase ?? "idle", blink);

    if (sprite?.complete && sprite.naturalWidth > 0) {
      drawAlarmLightSprite(context, light.position, sprite, isTriggered, blink);
    } else {
      drawProceduralAlarmLight(context, light.position, isTriggered, blink);
    }

    if (isTriggered && alarm.phase === "active") {
      drawAlarmRallyPulse(context, light.rallyPoint, frame.timestamp, alarm.progress);
    }
  }
}

function getAlarmLightSprite(
  images: AlarmLightImages,
  isTriggered: boolean,
  phase: string,
  blink: number,
): HTMLImageElement | null {
  if (!isTriggered) {
    return images.off;
  }

  if (phase === "active" && blink > 0.42) {
    return images.glow ?? images.on;
  }

  if (phase === "warning" && blink < 0.34) {
    return images.off ?? images.on;
  }

  return images.on ?? images.glow ?? images.off;
}

function drawAlarmLightSprite(
  context: CanvasRenderingContext2D,
  position: Vector,
  image: HTMLImageElement,
  isTriggered: boolean,
  blink: number,
) {
  const size = ALARM_LIGHT_SPRITE_SIZE + (isTriggered ? blink * 4 : 0);
  const glowRadius = ALARM_LIGHT_SPRITE_SIZE * 0.55 + blink * 11;

  context.save();
  if (isTriggered) {
    context.fillStyle = `rgba(224, 45, 45, ${0.12 + blink * 0.2})`;
    context.beginPath();
    context.arc(position.x, position.y, glowRadius, 0, Math.PI * 2);
    context.fill();
  }

  context.imageSmoothingEnabled = true;
  context.drawImage(image, position.x - size / 2, position.y - size / 2, size, size);
  context.restore();
}

function drawProceduralAlarmLight(
  context: CanvasRenderingContext2D,
  position: Vector,
  isTriggered: boolean,
  blink: number,
) {
  const glowAlpha = isTriggered ? 0.24 + blink * 0.32 : 0.08;
  const coreAlpha = isTriggered ? 0.72 + blink * 0.28 : 0.42;
  const glowRadius = isTriggered ? 18 + blink * 10 : 13;

  context.save();
  context.fillStyle = `rgba(224, 45, 45, ${glowAlpha})`;
  context.beginPath();
  context.arc(position.x, position.y, glowRadius, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(38, 16, 16, 0.88)";
  roundRect(context, position.x - 10, position.y - 10, 20, 20, 5);
  context.fill();

  context.fillStyle = `rgba(255, 65, 65, ${coreAlpha})`;
  context.beginPath();
  context.arc(position.x, position.y, isTriggered ? 6.5 + blink * 1.5 : 5, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = isTriggered ? "rgba(255, 230, 230, 0.92)" : "rgba(255, 190, 190, 0.42)";
  context.lineWidth = isTriggered ? 2 : 1.2;
  context.beginPath();
  context.arc(position.x, position.y, 9, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawAlarmRallyPulse(
  context: CanvasRenderingContext2D,
  point: Vector,
  timestamp: number,
  progress: number,
) {
  const pulse = (Math.sin(timestamp * 16) + 1) * 0.5;
  const radius = 24 + pulse * 12 + progress * 10;

  context.save();
  context.fillStyle = "rgba(224, 45, 45, 0.12)";
  context.beginPath();
  context.arc(point.x, point.y, radius + 10, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = `rgba(224, 45, 45, ${0.52 + pulse * 0.34})`;
  context.lineWidth = 4;
  context.setLineDash([9, 7]);
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "rgba(224, 45, 45, 0.9)";
  context.beginPath();
  context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawTaskTargets(context: CanvasRenderingContext2D, task: RoundTask, frame: ReplaySnapshot) {
  for (const [index, step] of task.steps.entries()) {
    if (step.kind === "collect") {
      continue;
    }

    const completed = frame.completedTaskIds.includes(step.id);
    const pulse = glowPulse(frame.timestamp, index * 0.28);
    const stroke = completed ? "rgba(40, 157, 96, 0.86)" : "rgba(243, 165, 29, 0.88)";
    const fill = completed ? "rgba(40, 157, 96, 0.12)" : "rgba(243, 165, 29, 0.16)";
    const glow = completed ? "rgba(40, 157, 96, 0.11)" : `rgba(255, 198, 74, ${0.12 + pulse * 0.1})`;

    if (step.rect) {
      drawRectTaskTarget(context, step, { stroke, fill, glow, completed, timestamp: frame.timestamp });
      continue;
    }

    if (step.position) {
      drawPointTaskTarget(context, step, { stroke, fill, glow, completed, pulse });
    }
  }
}

function drawPointTaskTarget(
  context: CanvasRenderingContext2D,
  step: TaskStep,
  options: {
    stroke: string;
    fill: string;
    glow: string;
    completed: boolean;
    pulse: number;
  },
) {
  if (!step.position) {
    return;
  }

  const radius = (step.radius ?? 27) + (options.completed ? 0 : options.pulse * 3);

  context.save();
  context.fillStyle = options.glow;
  context.beginPath();
  context.arc(step.position.x, step.position.y, radius + 12, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = options.fill;
  context.strokeStyle = options.stroke;
  context.lineWidth = options.completed ? 3 : 2.4;
  context.setLineDash(options.completed ? [] : [8, 6]);
  context.beginPath();
  context.arc(step.position.x, step.position.y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = options.completed ? "rgba(40, 157, 96, 0.92)" : COLORS.interactable;
  context.beginPath();
  context.arc(step.position.x, step.position.y, 4.8, 0, Math.PI * 2);
  context.fill();

  if (options.completed) {
    drawTaskCheck(context, step.position.x, step.position.y);
  }

  context.restore();
}

function drawRectTaskTarget(
  context: CanvasRenderingContext2D,
  step: TaskStep,
  options: {
    stroke: string;
    fill: string;
    glow: string;
    completed: boolean;
    timestamp: number;
  },
) {
  const rect = step.rect;
  if (!rect) {
    return;
  }

  const pulse = (Math.sin(options.timestamp * 8) + 1) * 0.5;
  const sign = step.targetId === "lower-walkway" ? -1 : 1;

  context.save();
  context.fillStyle = options.glow;
  roundRect(context, rect.x - 5, rect.y - 5, rect.width + 10, rect.height + 10, 7);
  context.fill();

  context.fillStyle = options.fill;
  context.strokeStyle = options.stroke;
  context.lineWidth = options.completed ? 3 : 2.4;
  context.setLineDash(options.completed ? [] : [10, 8]);
  roundRect(context, rect.x, rect.y, rect.width, rect.height, 6);
  context.fill();
  context.stroke();
  context.setLineDash([]);

  const arrowCount = 3;
  const centerY = rect.y + rect.height / 2;
  context.strokeStyle = options.completed ? "rgba(40, 157, 96, 0.76)" : `rgba(243, 165, 29, ${0.68 + pulse * 0.24})`;
  context.lineWidth = 3;
  context.lineCap = "round";
  for (let index = 0; index < arrowCount; index += 1) {
    const centerX = rect.x + rect.width * ((index + 0.5) / arrowCount);
    context.beginPath();
    context.moveTo(centerX - sign * 10, centerY - 8);
    context.lineTo(centerX + sign * 10, centerY);
    context.lineTo(centerX - sign * 10, centerY + 8);
    context.stroke();
  }

  if (options.completed) {
    drawTaskCheck(context, rect.x + rect.width - 20, rect.y + 18);
  }

  context.restore();
}

function drawTaskCheck(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.fillStyle = "rgba(40, 157, 96, 0.94)";
  context.beginPath();
  context.arc(x, y, 10, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(255, 255, 255, 0.96)";
  context.lineWidth = 2.3;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(x - 4.5, y + 0.4);
  context.lineTo(x - 1.2, y + 4);
  context.lineTo(x + 5.2, y - 4.2);
  context.stroke();
  context.restore();
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
    case "task":
      return "rgba(243, 165, 29, 0.98)";
    case "alarm":
      return "rgba(245, 76, 76, 0.98)";
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
    case "task":
      return "tsk";
    case "alarm":
      return "alm";
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
    if (isPointUnderCover(previous, map) || isPointUnderCover(current, map) || distanceBetween(previous, current) > 90) {
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
    stunImage: HTMLImageElement | null;
    popImage: HTMLImageElement | null;
    respawnImage: HTMLImageElement | null;
    selectedActorId: string | null;
    guessActorId: string | null;
    humanActorId: string | null;
    countdownHighlightActorId: string | null;
    reveal: boolean;
  },
) {
  const ordered = [...options.frame.actors].sort((a, b) => a.y - b.y);

  for (const actor of ordered) {
    const isSelected = actor.id === options.selectedActorId;
    const isGuess = actor.id === options.guessActorId;
    const isHuman = actor.id === options.humanActorId;
    const isCountdownHighlight = actor.id === options.countdownHighlightActorId;
    const isCovered = isActorUnderCover(actor, options.map);
    const takedownProgress = actor.takedownProgress ?? 0;
    const respawnProgress = actor.respawnProgress ?? 0;
    const isPopping = takedownProgress >= POP_EFFECT_START_PROGRESS;

    if (isCovered && !options.reveal) {
      continue;
    }

    drawActorHighlight(context, actor, {
      isSelected,
      isGuess,
      isHuman,
      isCountdownHighlight,
      reveal: options.reveal,
      timestamp: options.frame.timestamp,
    });

    if (respawnProgress > 0 && !isPopping) {
      drawRespawnEffect(context, actor, options.respawnImage, respawnProgress);
    }

    if (!isPopping) {
      const actorOpacity = respawnProgress > 0 ? Math.min(1, 0.35 + respawnProgress * 1.2) : 1;
      drawRobotSprite(context, actor, options.robotImage, actorOpacity);
    }

    if (actor.stunned && !isPopping) {
      drawStunEffect(context, actor, options.stunImage, options.frame.timestamp);
    }

    if (isPopping) {
      drawPopEffect(context, actor, options.popImage, takedownProgress);
    }
  }
}

function drawSweepers(context: CanvasRenderingContext2D, frame: ReplaySnapshot, image: HTMLImageElement | null) {
  const sweepers = frame.sweepers && frame.sweepers.length > 0 ? frame.sweepers : frame.sweeper ? [frame.sweeper] : [];

  for (const sweeper of sweepers) {
    drawSweeper(context, frame, sweeper, image);
  }
}

function drawSweeper(
  context: CanvasRenderingContext2D,
  frame: ReplaySnapshot,
  sweeper: NonNullable<ReplaySnapshot["sweeper"]>,
  image: HTMLImageElement | null,
) {
  if (!sweeper) {
    return;
  }

  const pulse = (Math.sin(frame.timestamp * 13) + 1) * 0.5;
  const scanLength = 28 + pulse * 8;
  const scanSpread = Math.PI * 0.34;
  const spriteWidth = SWEEPER_SPRITE_SIZE;
  const spriteHeight = image?.naturalWidth ? spriteWidth * (image.naturalHeight / image.naturalWidth) : spriteWidth;

  context.save();
  context.translate(sweeper.x, sweeper.y);
  context.rotate(sweeper.heading);

  context.fillStyle = `rgba(223, 77, 77, ${0.1 + pulse * 0.08})`;
  context.beginPath();
  context.moveTo(0, 0);
  context.arc(0, 0, scanLength, -scanSpread / 2, scanSpread / 2);
  context.closePath();
  context.fill();
  context.restore();

  context.save();
  context.strokeStyle = `rgba(255, 66, 66, ${0.28 + pulse * 0.24})`;
  context.lineWidth = 2.2;
  context.beginPath();
  context.arc(sweeper.x, sweeper.y, SWEEPER_RADIUS + 7 + pulse * 3, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = `rgba(255, 66, 66, ${0.08 + pulse * 0.08})`;
  context.beginPath();
  context.arc(sweeper.x, sweeper.y, SWEEPER_RADIUS + 12 + pulse * 4, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.translate(sweeper.x, sweeper.y);
  context.rotate(sweeper.heading + SWEEPER_SPRITE_ROTATION_OFFSET);
  context.imageSmoothingEnabled = true;

  if (image?.complete && image.naturalWidth > 0) {
    context.drawImage(image, -spriteWidth / 2, -spriteHeight / 2, spriteWidth, spriteHeight);
  } else {
    context.fillStyle = "rgba(25, 31, 35, 0.92)";
    context.strokeStyle = "rgba(250, 250, 250, 0.72)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, SWEEPER_RADIUS, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = `rgba(255, 66, 66, ${0.72 + pulse * 0.26})`;
    context.beginPath();
    context.arc(SWEEPER_RADIUS * 0.45, 0, 4.2, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawStunEffect(
  context: CanvasRenderingContext2D,
  actor: ActorSnapshot,
  image: HTMLImageElement | null,
  timestamp: number,
) {
  if (image?.complete && image.naturalWidth > 0) {
    const frameIndex = Math.floor(timestamp * STUN_SPRITE_FRAME_RATE) % STUN_SPRITE_FRAME_COUNT;
    context.save();
    context.translate(actor.x, actor.y);
    context.imageSmoothingEnabled = true;
    context.drawImage(
      image,
      frameIndex * STUN_SPRITE_FRAME_SIZE,
      0,
      STUN_SPRITE_FRAME_SIZE,
      STUN_SPRITE_FRAME_SIZE,
      -STUN_EFFECT_DRAW_SIZE / 2,
      -STUN_EFFECT_DRAW_SIZE / 2,
      STUN_EFFECT_DRAW_SIZE,
      STUN_EFFECT_DRAW_SIZE,
    );
    context.restore();
    return;
  }

  const pulse = (Math.sin(timestamp * 18) + 1) * 0.5;
  const radius = ACTOR_SPRITE_SIZE * 0.6 + 5 + pulse * 3;

  context.save();
  context.strokeStyle = `rgba(255, 196, 67, ${0.58 + pulse * 0.28})`;
  context.lineWidth = 2.3;
  context.setLineDash([4, 5]);
  context.beginPath();
  context.arc(actor.x, actor.y, radius, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);

  context.strokeStyle = `rgba(255, 72, 72, ${0.44 + pulse * 0.24})`;
  context.lineWidth = 1.8;
  for (let index = 0; index < 4; index += 1) {
    const angle = timestamp * 5 + index * (Math.PI / 2);
    const inner = radius - 5;
    const outer = radius + 4;
    context.beginPath();
    context.moveTo(actor.x + Math.cos(angle) * inner, actor.y + Math.sin(angle) * inner);
    context.lineTo(actor.x + Math.cos(angle + 0.2) * outer, actor.y + Math.sin(angle + 0.2) * outer);
    context.stroke();
  }
  context.restore();
}

function drawPopEffect(
  context: CanvasRenderingContext2D,
  actor: ActorSnapshot,
  image: HTMLImageElement | null,
  takedownProgress: number,
) {
  const localProgress = clamp(
    (takedownProgress - POP_EFFECT_START_PROGRESS) / (1 - POP_EFFECT_START_PROGRESS),
    0,
    0.999,
  );
  const frameIndex = Math.min(POP_SPRITE_FRAME_COUNT - 1, Math.floor(localProgress * POP_SPRITE_FRAME_COUNT));
  const size = POP_EFFECT_DRAW_SIZE * (0.86 + localProgress * 0.22);

  context.save();
  context.translate(actor.x, actor.y);

  if (image?.complete && image.naturalWidth > 0) {
    context.imageSmoothingEnabled = true;
    context.drawImage(
      image,
      frameIndex * POP_SPRITE_FRAME_SIZE,
      0,
      POP_SPRITE_FRAME_SIZE,
      POP_SPRITE_FRAME_SIZE,
      -size / 2,
      -size / 2,
      size,
      size,
    );
  } else {
    const burst = 1 - localProgress;
    context.strokeStyle = `rgba(38, 116, 232, ${0.5 + burst * 0.4})`;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, 18 + localProgress * 28, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = `rgba(255, 255, 255, ${0.55 * burst})`;
    context.beginPath();
    context.arc(0, 0, 12 + localProgress * 20, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawRespawnEffect(
  context: CanvasRenderingContext2D,
  actor: ActorSnapshot,
  image: HTMLImageElement | null,
  respawnProgress: number,
) {
  const localProgress = clamp(respawnProgress, 0, 0.999);
  const frameIndex = Math.min(RESPAWN_SPRITE_FRAME_COUNT - 1, Math.floor(localProgress * RESPAWN_SPRITE_FRAME_COUNT));
  const size = RESPAWN_EFFECT_DRAW_SIZE;

  context.save();
  context.translate(actor.x, actor.y);

  if (image?.complete && image.naturalWidth > 0) {
    context.imageSmoothingEnabled = true;
    context.drawImage(
      image,
      frameIndex * RESPAWN_SPRITE_FRAME_SIZE,
      0,
      RESPAWN_SPRITE_FRAME_SIZE,
      RESPAWN_SPRITE_FRAME_SIZE,
      -size / 2,
      -size / 2,
      size,
      size,
    );
  } else {
    context.strokeStyle = `rgba(38, 167, 232, ${0.55 * (1 - localProgress)})`;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, 22 + localProgress * 18, 0, Math.PI * 2);
    context.stroke();
  }

  context.restore();
}

function drawActorHighlight(
  context: CanvasRenderingContext2D,
  actor: ActorSnapshot,
  state: {
    isSelected: boolean;
    isGuess: boolean;
    isHuman: boolean;
    isCountdownHighlight: boolean;
    reveal: boolean;
    timestamp: number;
  },
) {
  const baseRadius = ACTOR_SPRITE_SIZE * 0.62;

  if (!state.reveal && state.isCountdownHighlight) {
    const pulse = (Math.sin(Date.now() / 1000 * 7 + state.timestamp) + 1) * 0.5;
    drawRing(
      context,
      actor.x,
      actor.y,
      baseRadius + 9 + pulse * 2,
      COLORS.item,
      3.2,
      `rgba(38, 116, 232, ${0.16 + pulse * 0.16})`,
    );
  }

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
