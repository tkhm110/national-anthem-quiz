/**
 * 画面の切り替えだけを担当する。状態遷移のルールは lib/game、出題のルールは lib/quiz にある。
 */
import { useEffect, useReducer } from "react";
import { Credits } from "./components/Credits";
import { ModeSelect } from "./components/ModeSelect";
import { QuizScreen } from "./components/QuizScreen";
import { ResultScreen } from "./components/ResultScreen";
import { buildAudioUrl } from "./lib/audio";
import { loadBundledDataset } from "./lib/data/bundled";
import { gameReducer, initialGameState } from "./lib/game";
import { generateSession, type QuizCondition } from "./lib/quiz";
import type { Anthem } from "./lib/schema";

const dataset = loadBundledDataset();
const anthemsById: ReadonlyMap<string, Anthem> = new Map(dataset.anthems.map((a) => [a.id, a]));
const audioBaseUrl = import.meta.env.VITE_AUDIO_BASE_URL || `${import.meta.env.BASE_URL}audio/`;
const audioUrl = (anthem: Anthem) => buildAudioUrl(anthem.audio.file, audioBaseUrl);

export function App() {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  // プレイ中にページを閉じる・再読み込みするときは確認を出す（進行状況は保存しないため）
  useEffect(() => {
    if (state.phase !== "playing") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.phase]);

  function start(condition: QuizCondition) {
    const result = generateSession(dataset.anthems, dataset.melodyGroups, {
      ...condition,
      rng: Math.random,
    });
    if (result.ok) dispatch({ type: "start", condition, questions: result.questions });
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>国歌クイズ</h1>
        <p className="hint">国歌の演奏を聴いて、どの国の国歌かを4択で当てよう</p>
      </header>

      <main>
        {state.phase === "select" && (
          <ModeSelect
            anthems={dataset.anthems}
            melodyGroups={dataset.melodyGroups}
            onStart={start}
          />
        )}
        {state.phase === "playing" && (
          <QuizScreen
            condition={state.condition}
            questions={state.questions}
            index={state.index}
            answer={state.answers[state.index] ?? null}
            anthemsById={anthemsById}
            audioUrl={audioUrl}
            onAnswer={(choiceId) => dispatch({ type: "answer", choiceId })}
            onNext={() => dispatch({ type: "next" })}
            onQuit={() => dispatch({ type: "quit" })}
          />
        )}
        {state.phase === "finished" && (
          <ResultScreen
            condition={state.condition}
            questions={state.questions}
            answers={state.answers}
            anthemsById={anthemsById}
            onRetry={() => start(state.condition)}
            onBack={() => dispatch({ type: "quit" })}
          />
        )}
      </main>

      <footer className="app-footer">
        <Credits anthems={dataset.anthems} />
      </footer>
    </div>
  );
}
