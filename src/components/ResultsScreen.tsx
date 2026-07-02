import { RotateCcw } from "lucide-react";
import { findSnapshotActor, getReplayFrame } from "../game/replay";
import type { ReplayRecording } from "../game/types";
import GameCanvas from "./GameCanvas";

type ResultsScreenProps = {
  recording: ReplayRecording;
  guessActorId: string;
  onPlayAgain: () => void;
};

export default function ResultsScreen({
  recording,
  guessActorId,
  onPlayAgain,
}: ResultsScreenProps) {
  const finalFrame = getReplayFrame(recording, recording.duration);
  const human = findSnapshotActor(finalFrame, recording.humanActorId);
  const guess = findSnapshotActor(finalFrame, guessActorId);
  const correct = guessActorId === recording.humanActorId;

  return (
    <main className="screen results-screen">
      <section className="results-copy">
        <p className="eyebrow">Reveal</p>
        <h1>{correct ? "Correct accusation" : "The human slipped by"}</h1>
        <p className="lead">
          Player 2 chose Clanker {guess?.label ?? "?"}. The hidden player was Clanker{" "}
          {human?.label ?? "?"}.
        </p>

        <div className="result-grid">
          <div>
            <span>Hide result</span>
            <strong>{recording.outcome.humanWon ? "Scored enough" : "Short on points"}</strong>
          </div>
          <div>
            <span>Points scored</span>
            <strong>
              {recording.outcome.humanCollected}/{recording.outcome.requiredItems}
            </strong>
          </div>
          <div>
            <span>Replay length</span>
            <strong>{recording.duration.toFixed(1)}s</strong>
          </div>
          <div>
            <span>Bot decoys</span>
            <strong>{recording.outcome.botCollections}</strong>
          </div>
        </div>

        <button className="primary-button" type="button" onClick={onPlayAgain}>
          <RotateCcw size={20} aria-hidden="true" />
          Play Again
        </button>
      </section>

      <section className="results-board">
        <div className="canvas-shell">
          <GameCanvas
            mode="results"
            recording={recording}
            frame={finalFrame}
            reveal
            humanActorId={recording.humanActorId}
            guessActorId={guessActorId}
          />
        </div>
      </section>
    </main>
  );
}
