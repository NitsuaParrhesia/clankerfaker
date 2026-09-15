import { ACTOR_RADIUS, GAME_HEIGHT, GAME_WIDTH, REQUIRED_ITEMS } from "../../src/game/constants";
import { createRecording, createSnapshot } from "../../src/game/replay";
import { createInitialGame, findHumanActor, stepSimulation } from "../../src/game/simulation";
import type { GameState, ReplayRecording, Vector } from "../../src/game/types";

const STEP = 16;
const COLUMNS = GAME_WIDTH / STEP;
const ROWS = GAME_HEIGHT / STEP;
const DT = 1 / 60;

function distance(first: Vector, second: Vector): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function clearPoint(state: GameState, point: Vector): boolean {
  const radius = ACTOR_RADIUS + 1;
  return point.x >= radius && point.x <= GAME_WIDTH - radius &&
    point.y >= radius && point.y <= GAME_HEIGHT - radius &&
    !state.mapLayer.collisionRects.some((rect) => {
      const x = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
      const y = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
      return distance(point, { x, y }) < radius;
    });
}

function clearLine(state: GameState, start: Vector, end: Vector): boolean {
  const steps = Math.ceil(distance(start, end) / 4);
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps ? step / steps : 0;
    if (!clearPoint(state, {
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    })) return false;
  }
  return true;
}

function gridPoint(index: number): Vector {
  return { x: (index % COLUMNS) * STEP + STEP / 2, y: Math.floor(index / COLUMNS) * STEP + STEP / 2 };
}

function planPath(state: GameState, start: Vector, target: Vector): Vector[] {
  if (clearLine(state, start, target)) return [target];
  const nodes = Array.from({ length: COLUMNS * ROWS }, (_, index) => index)
    .filter((index) => clearPoint(state, gridPoint(index)));
  const valid = new Set(nodes);
  const nearest = (point: Vector) => nodes.reduce((best, index) =>
    distance(gridPoint(index), point) < distance(gridPoint(best), point) ? index : best);
  const initial = nearest(start);
  const destination = nearest(target);
  const queue = new Set([initial]);
  const cost = new Map([[initial, 0]]);
  const previous = new Map<number, number>();
  while (queue.size) {
    const current = [...queue].reduce((best, index) =>
      cost.get(index)! + distance(gridPoint(index), target) <
        cost.get(best)! + distance(gridPoint(best), target) ? index : best);
    if (current === destination) {
      const path = [target, gridPoint(current)];
      let cursor = current;
      while (previous.has(cursor)) {
        cursor = previous.get(cursor)!;
        path.push(gridPoint(cursor));
      }
      return path.reverse();
    }
    queue.delete(current);
    for (const offset of [-COLUMNS - 1, -COLUMNS, -COLUMNS + 1, -1, 1, COLUMNS - 1, COLUMNS, COLUMNS + 1]) {
      const next = current + offset;
      if (!valid.has(next) || !clearLine(state, gridPoint(current), gridPoint(next))) continue;
      const candidate = cost.get(current)! + distance(gridPoint(current), gridPoint(next));
      if (candidate >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, candidate);
      previous.set(next, current);
      queue.add(next);
    }
  }
  return [target];
}

/** Drives the real simulation using only movement input; never changes game state. */
export function playWinningRound(seed = 42): ReplayRecording {
  const state = createInitialGame(seed);
  const snapshots = [createSnapshot(state)];
  let path: Vector[] = [];
  let previousTarget = "";
  for (let frame = 0; frame < 2200 && state.status === "running"; frame += 1) {
    const human = findHumanActor(state);
    const task = state.task.steps.find((step) => step.kind !== "collect" && !human.completedTaskIds.includes(step.id));
    const item = [...state.items].filter((candidate) => candidate.active)
      .sort((first, second) => distance(first.position, human.position) - distance(second.position, human.position))[0];
    const target = task
      ? { id: task.id, position: task.position ?? {
        x: task.rect!.x + task.rect!.width / 2, y: task.rect!.y + task.rect!.height / 2,
      }, radius: task.radius ? task.radius - 8 : 10 }
      : human.collected < REQUIRED_ITEMS && item
        ? { id: item.id, position: item.position, radius: 5 }
        : { id: "finished", position: human.position, radius: Infinity };
    if (target.id !== previousTarget || frame % 90 === 0) {
      path = planPath(state, human.position, target.position);
      previousTarget = target.id;
    }
    while (path.length > 1 && (distance(human.position, path[0]) < 8 || clearLine(state, human.position, path[1]))) {
      path.shift();
    }
    const waypoint = path[0] ?? target.position;
    const remaining = distance(human.position, target.position);
    const length = distance(human.position, waypoint);
    const moving = remaining > target.radius && length > 0;
    stepSimulation(state, {
      up: false, down: false, left: false, right: false,
      moveX: moving ? (waypoint.x - human.position.x) / length : 0,
      moveY: moving ? (waypoint.y - human.position.y) / length : 0,
    }, DT);
    if (frame % 6 === 5 || state.status !== "running") snapshots.push(createSnapshot(state));
  }
  if (state.status !== "human-won") {
    throw new Error(`Seed ${seed} did not win: ${findHumanActor(state).collected} tokens, ${state.humanCollected}/${state.requiredItems} tasks.`);
  }
  return createRecording(state, snapshots);
}
