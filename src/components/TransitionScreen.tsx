import { Check, Copy, Eye, LoaderCircle, Play, RotateCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { createReplayShare, type ReplayShare } from "../game/shareLink";
import type { ReplayRecording } from "../game/types";

type TransitionScreenProps = {
  recording: ReplayRecording;
  onStartReplay: () => void;
  onReviewPool: (excludeId: string | null) => void;
  onStartNextRun: () => void;
  onRestartRun: () => void;
};

export default function TransitionScreen({
  recording,
  onStartReplay,
  onReviewPool,
  onStartNextRun,
  onRestartRun,
}: TransitionScreenProps) {
  const [share, setShare] = useState<ReplayShare | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const [linkError, setLinkError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setShare(null);
    setCopyState("idle");
    setLinkError(false);

    void createReplayShare(recording)
      .then((nextShare) => {
        if (!isCancelled) {
          setShare(nextShare);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLinkError(true);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [recording]);

  async function handleCopyLink() {
    if (!share?.url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(share.url);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  }

  const queueReady = share == null || share.stored;

  return (
    <main className="screen handoff-screen">
      <section className="handoff-panel">
        <p className="eyebrow">{queueReady ? "Run queued" : "Challenge ready"}</p>
        <h1>{queueReady ? "Your Faker Run Is Live" : "Your Replay Is Ready"}</h1>
        <p className="lead">
          {queueReady
            ? "Your run is ready for reviewers. Keep the loop going by spotting someone else's faker, or copy a link to challenge a specific friend."
            : "The replay queue is not reachable right now, but your direct challenge link is ready to send."}
        </p>

        <div className="handoff-actions">
          <button className="primary-button" type="button" onClick={() => onReviewPool(share?.id ?? null)}>
            <Search size={20} aria-hidden="true" />
            Spot a Faker
          </button>
          <button className="secondary-button" type="button" onClick={onStartNextRun}>
            <Play size={20} aria-hidden="true" />
            Be a Clanker
          </button>
          <button className="secondary-button" type="button" onClick={onStartReplay}>
            <Eye size={20} aria-hidden="true" />
            Preview Replay
          </button>
          <button className="secondary-button" type="button" onClick={onRestartRun}>
            <RotateCcw size={20} aria-hidden="true" />
            Restart the Run
          </button>
        </div>

        <label className="share-link-field">
          <span>Friend challenge link</span>
          <input
            readOnly
            value={linkError ? "Could not create link" : share?.url || "Preparing link..."}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>

        <div className="handoff-actions">
          <button className="secondary-button" type="button" disabled={!share?.url} onClick={handleCopyLink}>
            {copyState === "copied" ? <Check size={20} aria-hidden="true" /> : <Copy size={20} aria-hidden="true" />}
            {copyState === "copied" ? "Copied" : "Copy Link"}
          </button>
          {!share && !linkError && (
            <span className="helper-copy helper-copy--inline">
              <LoaderCircle size={17} aria-hidden="true" />
              Saving replay
            </span>
          )}
        </div>

        {copyState === "manual" && <p className="helper-copy">Select the field and copy the link manually.</p>}
        {linkError && <p className="helper-copy">Queue play still works. Try another browser if you need a link.</p>}
      </section>
    </main>
  );
}
