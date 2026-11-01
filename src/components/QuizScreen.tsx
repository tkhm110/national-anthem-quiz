import { useEffect, useRef } from "react";
import { DIFFICULTY_SETTINGS, QUIZ_REGIONS } from "../lib/quiz";
import type { Question, QuizCondition } from "../lib/quiz";
import type { Anthem } from "../lib/schema";
import { AudioPlayer } from "./AudioPlayer";

type Props = {
  condition: QuizCondition;
  questions: readonly Question[];
  index: number;
  answer: string | null;
  anthemsById: ReadonlyMap<string, Anthem>;
  audioUrl: (anthem: Anthem) => string;
  onAnswer: (choiceId: string) => void;
  onNext: () => void;
  onQuit: () => void;
};

export function QuizScreen({
  condition,
  questions,
  index,
  answer,
  anthemsById,
  audioUrl,
  onAnswer,
  onNext,
  onQuit,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const question = questions[index]!;
  const correct = anthemsById.get(question.answerId)!;
  const answered = answer !== null;
  const isLast = index + 1 === questions.length;
  const regionLabel = QUIZ_REGIONS.find((r) => r.value === condition.region)?.label;

  // 問題が変わったら見出しにフォーカスを移す（スクリーンリーダーで次の問題に気づけるように）
  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  function confirmQuit() {
    if (window.confirm("終了すると現在の進行状況は破棄されます。終了しますか？")) onQuit();
  }

  return (
    <section aria-labelledby="question-heading">
      <div className="quiz-header">
        <span className="quiz-mode">
          {regionLabel}・{DIFFICULTY_SETTINGS[condition.difficulty].label}
        </span>
        <button type="button" className="button button-quiet" onClick={confirmQuit}>
          終了
        </button>
      </div>

      <h2 id="question-heading" ref={headingRef} tabIndex={-1}>
        問題 {index + 1} / {questions.length}
      </h2>
      <p className="hint">この国歌はどの国のもの？</p>

      <AudioPlayer key={index} src={audioUrl(correct)} clip={question.clip} />

      <ul className="choices">
        {question.choiceIds.map((id) => {
          const anthem = anthemsById.get(id)!;
          const state = !answered
            ? ""
            : id === question.answerId
              ? "choice-correct"
              : id === answer
                ? "choice-wrong"
                : "choice-dim";
          return (
            <li key={id}>
              <button
                type="button"
                className={`choice ${state}`}
                disabled={answered}
                onClick={() => onAnswer(id)}
              >
                {anthem.nameJa}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="feedback" role="status" aria-live="polite">
        {answered && (
          <>
            <p className={answer === question.answerId ? "result-correct" : "result-wrong"}>
              {answer === question.answerId ? "正解！" : "不正解…"}
            </p>
            <p>
              正解は <strong>{correct.nameJa}</strong> の「
              {correct.anthemTitle.ja ?? correct.anthemTitle.original}」です。
            </p>
          </>
        )}
      </div>

      {answered && (
        <button type="button" className="button button-primary button-large" onClick={onNext}>
          {isLast ? "結果を見る" : "次の問題へ"}
        </button>
      )}
    </section>
  );
}
