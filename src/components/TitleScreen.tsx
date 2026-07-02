import { Play } from "lucide-react";

type TitleScreenProps = {
  onStart: () => void;
};

export default function TitleScreen({ onStart }: TitleScreenProps) {
  return (
    <main className="screen title-screen">
      <section className="title-copy">
        <img className="title-logo" src="/assets/logo.png" alt="Clanker Faker" />
        <h1 className="title-tagline">One of these clankers is human. Can you spot them?</h1>
        <button className="primary-button" type="button" onClick={onStart}>
          <Play size={20} aria-hidden="true" />
          Start Hide Phase
        </button>
      </section>

      <section className="brief-panel" aria-label="Round structure">
        <div className="phase-card">
          <span>1</span>
          <strong>Act like a Clanker</strong>
          <p>Control one secret clanker and blend in while you complete your task.</p>
        </div>
        <div className="phase-card">
          <span>2</span>
          <strong>Send Your Replay</strong>
          <p>
            Another player watches the run, scrubs the timeline, and tries to pick your fake
            clanker out of the crowd.
          </p>
        </div>
        <div className="phase-card">
          <span>3</span>
          <strong>Expose the Faker</strong>
          <p>
            Reveal the hidden player, compare the guess, and see whether the fake clanker got away
            with it.
          </p>
        </div>
      </section>
    </main>
  );
}
