import { describe, expect, it } from "vitest";
import { MAP_LAYER } from "./constants";
import { getActorTrail, getReplayFrame } from "./replay";
import type { ActorSnapshot, ReplayRecording, ReplaySnapshot } from "./types";

function actor(overrides: Partial<ActorSnapshot> = {}): ActorSnapshot {
  return {
    id: "actor-1",
    label: 1,
    x: 0,
    y: 10,
    heading: 0,
    collected: 0,
    stunned: false,
    takedownProgress: 0,
    respawnProgress: 0,
    ...overrides,
  };
}

function snapshot(timestamp: number, actorSnapshot: ActorSnapshot): ReplaySnapshot {
  return {
    timestamp,
    actors: [actorSnapshot],
    items: [],
    humanCollected: actorSnapshot.collected,
    objectiveReady: false,
    completedTaskIds: [],
    status: "running",
    alarm: null,
    sweeper: null,
  };
}

function recording(snapshots: ReplaySnapshot[]): ReplayRecording {
  return {
    snapshots,
    duration: snapshots[snapshots.length - 1]?.timestamp ?? 0,
    humanActorId: "actor-1",
    requiredItems: 3,
    task: {
      title: "Complete the task",
      description: "Test task",
      required: 1,
      steps: [
        {
          id: "collect-token",
          kind: "collect",
          label: "Collect 3 tokens",
          description: "Collect three tokens.",
        },
      ],
    },
    outcome: {
      humanWon: false,
      duration: snapshots[snapshots.length - 1]?.timestamp ?? 0,
      humanCollected: 0,
      requiredItems: 3,
      botCollections: 0,
      taskTitle: "Complete the task",
      reason: "timeout",
    },
    map: MAP_LAYER,
  };
}

describe("getReplayFrame", () => {
  it("interpolates movement and takes the shortest path between headings", () => {
    const replay = recording([
      snapshot(0, actor({ heading: (350 * Math.PI) / 180 })),
      snapshot(10, actor({ x: 100, heading: (10 * Math.PI) / 180, collected: 1 })),
    ]);

    const frame = getReplayFrame(replay, 5);

    expect(frame.timestamp).toBe(5);
    expect(frame.actors[0].x).toBe(50);
    expect(Math.abs(frame.actors[0].heading)).toBeLessThan(0.001);
    expect(frame.actors[0].collected).toBe(0);
  });

  it("clamps requests to the recorded time range", () => {
    const first = snapshot(2, actor({ x: 20 }));
    const last = snapshot(8, actor({ x: 80 }));
    const replay = recording([first, last]);

    expect(getReplayFrame(replay, -100)).toBe(first);
    expect(getReplayFrame(replay, 100)).toBe(last);
  });
});

describe("getActorTrail", () => {
  it("caps trail history and includes the interpolated current point", () => {
    const replay = recording([
      snapshot(0, actor({ x: 0 })),
      snapshot(1, actor({ x: 10 })),
      snapshot(2, actor({ x: 20 })),
      snapshot(3, actor({ x: 30 })),
    ]);

    expect(getActorTrail(replay, "actor-1", 2.5, 3)).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 25, y: 10 },
    ]);
  });
});
