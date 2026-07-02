import { Check, Copy, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { createReplayShareUrl } from "../game/shareLink";
import type { ReplayRecording } from "../game/types";

type TransitionScreenProps = {
  recording: ReplayRecording;
  onStartReplay: () => void;
  onRestartRun: () => void;
};

export default function TransitionScreen({ recording, onStartReplay, onRestartRun }: TransitionScreenProps) {
  const [shareUrl, setShareUrl] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const [linkError, setLinkError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setShareUrl("");
    setCopyState("idle");
    setLinkError(false);

    void createReplayShareUrl(recording)
      .then((url) => {
        if (!isCancelled) {
          setShareUrl(url);
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
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  }

  return (
    <main className="screen handoff-screen">
      <section className="handoff-panel">
        <h1>Send the Review Link</h1>
        <p className="lead">
          Copy the link and send it to a Player 2. They'll watch your replay, and try to pick out
          your fake clanker.
        </p>

        <label className="share-link-field">
          <span>Review link</span>
          <input
            readOnly
            value={linkError ? "Could not create link" : shareUrl || "Preparing link..."}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>

        <div className="handoff-actions">
          <button className="primary-button" type="button" disabled={!shareUrl} onClick={handleCopyLink}>
            {copyState === "copied" ? <Check size={20} aria-hidden="true" /> : <Copy size={20} aria-hidden="true" />}
            {copyState === "copied" ? "Copied" : "Copy Link"}
          </button>
          <button className="secondary-button" type="button" onClick={onStartReplay}>
            {shareUrl ? <Play size={20} aria-hidden="true" /> : <LoaderCircle size={20} aria-hidden="true" />}
            Preview Replay
          </button>
          <button className="secondary-button" type="button" onClick={onRestartRun}>
            <RotateCcw size={20} aria-hidden="true" />
            Restart the Run
          </button>
        </div>

        {copyState === "manual" && <p className="helper-copy">Select the field and copy the link manually.</p>}
        {linkError && <p className="helper-copy">Preview the replay on this device and try another browser for links.</p>}
      </section>
    </main>
  );
}
