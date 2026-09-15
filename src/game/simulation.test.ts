import { describe, expect, it } from "vitest";
import { ACTOR_COUNT, BOT_COUNT, GAME_HEIGHT, GAME_WIDTH, ITEM_COUNT } from "./constants";
import { createInitialGame, findHumanActor, stepSimulation } from "./simulation";
import type { GameState } from "./types";

function projectDeterministicState(state: GameState) {
  return {
    humanActorId: state.humanActorId,
    task: state.task,
    alarm: state.alarm,
    actors: state.actors.map((actor) => ({
      id: actor.id,
      kind: actor.kind,
      position: actor.position,
      heading: actor.heading,
      speed: actor.speed,
      personality: actor.bot?.personality,
      target: actor.bot?.target,
    })),
    items: state.items,
  };
}

describe("createInitialGame", () => {
  it("creates one human, ten bots, and a complete objective", () => {
    const state = createInitialGame(42);
    const human = findHumanActor(state);

    expect(state.actors).toHaveLength(ACTOR_COUNT);
    expect(state.actors.filter((actor) => actor.kind === "bot")).toHaveLength(BOT_COUNT);
    expect(state.actors.filter((actor) => actor.kind === "human")).toEqual([human]);
    expect(new Set(state.actors.map((actor) => actor.id)).size).toBe(ACTOR_COUNT);
    expect(state.items).toHaveLength(ITEM_COUNT);
    expect(state.task.steps).toHaveLength(state.task.required);
    expect(state.task.steps.some((step) => step.kind === "collect")).toBe(true);
  });

  it("replays the same setup for the same seed", () => {
    expect(projectDeterministicState(createInitialGame(8_675_309))).toEqual(
      projectDeterministicState(createInitialGame(8_675_309)),
    );
  });
});

describe("stepSimulation", () => {
  it("advances every actor while preserving world invariants", () => {
    const state = createInitialGame(123_456);

    for (let frame = 0; frame < 180; frame += 1) {
      stepSimulation(state, undefined, 1 / 60);
    }

    expect(state.timeElapsed).toBeCloseTo(3, 5);
    expect(state.timeRemaining).toBeCloseTo(32, 5);
    expect(state.status).toBe("running");

    for (const actor of state.actors) {
      expect(Number.isFinite(actor.position.x)).toBe(true);
      expect(Number.isFinite(actor.position.y)).toBe(true);
      expect(actor.position.x).toBeGreaterThanOrEqual(0);
      expect(actor.position.x).toBeLessThanOrEqual(GAME_WIDTH);
      expect(actor.position.y).toBeGreaterThanOrEqual(0);
      expect(actor.position.y).toBeLessThanOrEqual(GAME_HEIGHT);
    }
  });
});
