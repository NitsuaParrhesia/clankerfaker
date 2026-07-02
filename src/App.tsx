import { useEffect, useRef, useState, type ReactNode } from "react";
import HidePhase from "./components/HidePhase";
import ReplayPhase from "./components/ReplayPhase";
import TitleScreen from "./components/TitleScreen";
import TransitionScreen from "./components/TransitionScreen";
import { clearReplayShareHash, decodeReplayShareUrl, hasReplayShareHash } from "./game/shareLink";
import type { GamePhase, ReplayRecording } from "./game/types";

export default function App() {
  const [phase, setPhase] = useState<GamePhase>("title");
  const [recording, setRecording] = useState<ReplayRecording | null>(null);
  const [guessActorId, setGuessActorId] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [showSharedReplayIntro, setShowSharedReplayIntro] = useState(false);
  const [hideRunKey, setHideRunKey] = useState(0);
  const shareLoadIdRef = useRef(0);

  useEffect(() => {
    function handleSharedReplay() {
      if (!hasReplayShareHash(window.location.hash)) {
        return;
      }

      const loadId = shareLoadIdRef.current + 1;
      shareLoadIdRef.current = loadId;
      setPhase("loading-share");
      setRecording(null);
      setGuessActorId(null);
      setShareError(null);
      setShowSharedReplayIntro(false);

      void decodeReplayShareUrl()
        .then((sharedRecording) => {
          if (shareLoadIdRef.current !== loadId || !sharedRecording) {
            return;
          }

          setRecording(sharedRecording);
          setShowSharedReplayIntro(true);
          setPhase("replay");
        })
        .catch(() => {
          if (shareLoadIdRef.current !== loadId) {
            return;
          }

          setShareError("That replay link could not be opened.");
          setPhase("share-error");
        });
    }

    handleSharedReplay();
    window.addEventListener("hashchange", handleSharedReplay);
    return () => window.removeEventListener("hashchange", handleSharedReplay);
  }, []);

  function startHidePhase() {
    if (hasReplayShareHash(window.location.hash)) {
      window.history.replaceState(null, "", clearReplayShareHash());
    }
    setRecording(null);
    setGuessActorId(null);
    setShareError(null);
    setShowSharedReplayIntro(false);
    setHideRunKey((value) => value + 1);
    setPhase("hide");
  }

  function handleHideComplete(nextRecording: ReplayRecording) {
    setRecording(nextRecording);
    setShowSharedReplayIntro(false);
    setPhase(nextRecording.outcome.humanWon ? "handoff" : "invalid-run");
  }

  function handleGuess(actorId: string) {
    setGuessActorId(actorId);
    setShowSharedReplayIntro(false);
    setPhase("replay");
  }

  return (
    <div className="app-shell">
      {phase === "loading-share" && <ShareStatusScreen title="Loading Replay" copy="Preparing Player 2 review." />}
      {phase === "share-error" && (
        <ShareStatusScreen title="Replay Link Failed" copy={shareError ?? "This replay link is not valid."}>
          <button className="primary-button" type="button" onClick={startHidePhase}>
            Start New Round
          </button>
        </ShareStatusScreen>
      )}
      {phase === "title" && <TitleScreen onStart={startHidePhase} />}
      {phase === "hide" && (
        <HidePhase key={hideRunKey} onComplete={handleHideComplete} onRestart={startHidePhase} />
      )}
      {phase === "invalid-run" && recording && (
        <InvalidRunScreen recording={recording} onRestartRun={startHidePhase} />
      )}
      {phase === "handoff" && recording && (
        <TransitionScreen recording={recording} onStartReplay={() => setPhase("replay")} onRestartRun={startHidePhase} />
      )}
      {phase === "replay" && recording && (
        <ReplayPhase
          recording={recording}
          guessActorId={guessActorId}
          onGuess={handleGuess}
          onChallengeBack={startHidePhase}
          showChallengeIntro={showSharedReplayIntro}
        />
      )}
      <SiteFooter />
    </div>
  );
}

type InvalidRunScreenProps = {
  recording: ReplayRecording;
  onRestartRun: () => void;
};

function InvalidRunScreen({ recording, onRestartRun }: InvalidRunScreenProps) {
  return (
    <main className="screen handoff-screen">
      <section className="handoff-panel" role="alert" aria-live="assertive">
        <h1>Run Not Valid</h1>
        <p className="lead">
          You collected {recording.outcome.humanCollected}/{recording.outcome.requiredItems} blue points.
          You have to collect {recording.outcome.requiredItems} blue points within{" "}
          {Math.round(recording.outcome.duration)} seconds to create a valid run.
        </p>
        <button className="primary-button" type="button" onClick={onRestartRun}>
          Restart the Run
        </button>
      </section>
    </main>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      Built by{" "}
      <a href="https://austinembree.com" target="_blank" rel="noreferrer">
        Austin Embree
      </a>{" "}
      {"\u{1F916}"} definitely not a bot
    </footer>
  );
}

type ShareStatusScreenProps = {
  title: string;
  copy: string;
  children?: ReactNode;
};

function ShareStatusScreen({ title, copy, children }: ShareStatusScreenProps) {
  return (
    <main className="screen handoff-screen">
      <section className="handoff-panel">
        <p className="eyebrow">Shared run</p>
        <h1>{title}</h1>
        <p className="lead">{copy}</p>
        {children}
      </section>
    </main>
  );
}
