import { Play, Search, Trophy } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import HidePhase from "./components/HidePhase";
import LeaderboardScreen from "./components/LeaderboardScreen";
import ReplayPhase from "./components/ReplayPhase";
import TitleScreen from "./components/TitleScreen";
import TransitionScreen from "./components/TransitionScreen";
import { clearReplayShareHash, decodeReplayShare, hasReplayShareHash, loadPooledReplay } from "./game/shareLink";
import type { GamePhase, ReplayRecording } from "./game/types";

type ReplayIntroKind = "challenge" | "pool" | null;

export default function App() {
  const [phase, setPhase] = useState<GamePhase>("title");
  const [recording, setRecording] = useState<ReplayRecording | null>(null);
  const [guessActorId, setGuessActorId] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [replayIntroKind, setReplayIntroKind] = useState<ReplayIntroKind>(null);
  const [activeReplayId, setActiveReplayId] = useState<string | null>(null);
  const [hideRunKey, setHideRunKey] = useState(0);
  const shareLoadIdRef = useRef(0);
  const poolLoadIdRef = useRef(0);

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
      setPoolError(null);
      setReplayIntroKind(null);
      setActiveReplayId(null);

      void decodeReplayShare()
        .then((sharedReplay) => {
          if (shareLoadIdRef.current !== loadId || !sharedReplay) {
            return;
          }

          setRecording(sharedReplay.recording);
          setReplayIntroKind("challenge");
          setActiveReplayId(sharedReplay.id);
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

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [phase, hideRunKey]);

  function startHidePhase() {
    shareLoadIdRef.current += 1;
    poolLoadIdRef.current += 1;

    if (hasReplayShareHash(window.location.hash)) {
      window.history.replaceState(null, "", clearReplayShareHash());
    }
    setRecording(null);
    setGuessActorId(null);
    setShareError(null);
    setPoolError(null);
    setReplayIntroKind(null);
    setActiveReplayId(null);
    setHideRunKey((value) => value + 1);
    setPhase("hide");
  }

  function showTitleScreen() {
    shareLoadIdRef.current += 1;
    poolLoadIdRef.current += 1;

    if (hasReplayShareHash(window.location.hash)) {
      window.history.replaceState(null, "", clearReplayShareHash());
    }

    setRecording(null);
    setGuessActorId(null);
    setShareError(null);
    setPoolError(null);
    setReplayIntroKind(null);
    setActiveReplayId(null);
    setPhase("title");
  }

  function showLeaderboard() {
    shareLoadIdRef.current += 1;
    poolLoadIdRef.current += 1;

    if (hasReplayShareHash(window.location.hash)) {
      window.history.replaceState(null, "", clearReplayShareHash());
    }

    setRecording(null);
    setGuessActorId(null);
    setShareError(null);
    setPoolError(null);
    setReplayIntroKind(null);
    setActiveReplayId(null);
    setPhase("leaderboard");
  }

  function startPooledReplay(excludeId: string | null = activeReplayId) {
    shareLoadIdRef.current += 1;

    if (hasReplayShareHash(window.location.hash)) {
      window.history.replaceState(null, "", clearReplayShareHash());
    }

    const loadId = poolLoadIdRef.current + 1;
    poolLoadIdRef.current = loadId;
    setPhase("loading-pool");
    setRecording(null);
    setGuessActorId(null);
    setShareError(null);
    setPoolError(null);
    setReplayIntroKind(null);
    setActiveReplayId(null);

    void loadPooledReplay({ excludeId })
      .then((pooledReplay) => {
        if (poolLoadIdRef.current !== loadId) {
          return;
        }

        setRecording(pooledReplay.recording);
        setActiveReplayId(pooledReplay.id);
        setReplayIntroKind("pool");
        setPhase("replay");
      })
      .catch((error) => {
        if (poolLoadIdRef.current !== loadId) {
          return;
        }

        setPoolError(error instanceof Error ? error.message : "Replay queue could not be loaded.");
        setPhase("pool-empty");
      });
  }

  function handleHideComplete(nextRecording: ReplayRecording) {
    setRecording(nextRecording);
    setReplayIntroKind(null);
    setActiveReplayId(null);
    setPhase(nextRecording.outcome.humanWon ? "handoff" : "invalid-run");
  }

  function handleGuess(actorId: string) {
    setGuessActorId(actorId);
    setReplayIntroKind(null);
    setPhase("replay");
  }

  const showHeader = phase !== "title";

  return (
    <div className={`app-shell ${showHeader ? "app-shell--with-header" : ""}`}>
      {showHeader && (
        <AppHeader
          currentPhase={phase}
          onHome={showTitleScreen}
          onStartRun={startHidePhase}
          onSpotFaker={() => startPooledReplay()}
          onLeaderboard={showLeaderboard}
        />
      )}
      {phase === "loading-share" && (
        <StatusScreen eyebrow="Shared run" title="Loading Replay" copy="Preparing Player 2 review." />
      )}
      {phase === "share-error" && (
        <StatusScreen eyebrow="Shared run" title="Replay Link Failed" copy={shareError ?? "This replay link is not valid."}>
          <button className="primary-button" type="button" onClick={startHidePhase}>
            Start New Round
          </button>
        </StatusScreen>
      )}
      {phase === "loading-pool" && (
        <StatusScreen eyebrow="Quick play" title="Finding a Faker" copy="Pulling a queued run for you to review." />
      )}
      {phase === "pool-empty" && (
        <StatusScreen
          eyebrow="Quick play"
          title="No Runs Ready"
          copy={getPoolStatusCopy(poolError)}
        >
          <div className="handoff-actions">
            <button className="primary-button" type="button" onClick={startHidePhase}>
              Be a Clanker
            </button>
            <button className="secondary-button" type="button" onClick={() => startPooledReplay()}>
              Try Again
            </button>
          </div>
        </StatusScreen>
      )}
      {phase === "title" && (
        <TitleScreen onStart={startHidePhase} onReview={() => startPooledReplay(null)} onLeaderboard={showLeaderboard} />
      )}
      {phase === "leaderboard" && (
        <LeaderboardScreen onStart={startHidePhase} onReview={() => startPooledReplay(null)} />
      )}
      {phase === "hide" && (
        <HidePhase key={hideRunKey} onComplete={handleHideComplete} onRestart={startHidePhase} />
      )}
      {phase === "invalid-run" && recording && (
        <InvalidRunScreen recording={recording} onRestartRun={startHidePhase} />
      )}
      {phase === "handoff" && recording && (
        <TransitionScreen
          recording={recording}
          onStartReplay={() => setPhase("replay")}
          onReviewPool={(excludeId) => startPooledReplay(excludeId)}
          onStartNextRun={startHidePhase}
          onRestartRun={startHidePhase}
        />
      )}
      {phase === "replay" && recording && (
        <ReplayPhase
          recording={recording}
          replayId={activeReplayId}
          guessActorId={guessActorId}
          onGuess={handleGuess}
          onRecordRun={startHidePhase}
          onSpotAnother={() => startPooledReplay(activeReplayId)}
          introKind={replayIntroKind}
        />
      )}
      <SiteFooter />
    </div>
  );
}

type AppHeaderProps = {
  currentPhase: GamePhase;
  onHome: () => void;
  onStartRun: () => void;
  onSpotFaker: () => void;
  onLeaderboard: () => void;
};

function AppHeader({ currentPhase, onHome, onStartRun, onSpotFaker, onLeaderboard }: AppHeaderProps) {
  const isRunActive = currentPhase === "hide";
  const isReviewActive = currentPhase === "replay" || currentPhase === "loading-pool" || currentPhase === "pool-empty";
  const isLeaderboardActive = currentPhase === "leaderboard";

  return (
    <header className="app-header" aria-label="Clanker Faker navigation">
      <button className="app-header__brand" type="button" aria-label="Clanker Faker home" onClick={onHome}>
        <img src="/assets/robot.png" alt="" aria-hidden="true" />
        <span>Clanker Faker</span>
      </button>
      <nav className="app-header__nav" aria-label="Game navigation">
        <button
          className={`secondary-button app-header__button ${isRunActive ? "is-active" : ""}`}
          type="button"
          aria-current={isRunActive ? "page" : undefined}
          onClick={onStartRun}
        >
          <Play size={18} aria-hidden="true" />
          Be a Clanker
        </button>
        <button
          className={`secondary-button app-header__button ${isReviewActive ? "is-active" : ""}`}
          type="button"
          aria-current={isReviewActive ? "page" : undefined}
          onClick={onSpotFaker}
        >
          <Search size={18} aria-hidden="true" />
          Spot a Faker
        </button>
        <button
          className={`secondary-button app-header__button ${isLeaderboardActive ? "is-active" : ""}`}
          type="button"
          aria-current={isLeaderboardActive ? "page" : undefined}
          onClick={onLeaderboard}
        >
          <Trophy size={18} aria-hidden="true" />
          Leaderboard
        </button>
      </nav>
    </header>
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
          You completed {recording.outcome.humanCollected}/{recording.outcome.requiredItems} task steps.
          You have to finish the public task, including 3 tokens, within{" "}
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

function getPoolStatusCopy(error: string | null): string {
  if (error === "No queued replays are ready yet.") {
    return "There are no queued runs ready right now. Record one and seed the pool.";
  }

  if (error) {
    return "The replay queue is not reachable right now. Record a run or try again in a moment.";
  }

  return "There are no queued runs ready right now. Record one and seed the pool.";
}

type StatusScreenProps = {
  eyebrow: string;
  title: string;
  copy: string;
  children?: ReactNode;
};

function StatusScreen({ eyebrow, title, copy, children }: StatusScreenProps) {
  return (
    <main className="screen handoff-screen">
      <section className="handoff-panel">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lead">{copy}</p>
        {children}
      </section>
    </main>
  );
}
