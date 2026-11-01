import { useEffect, useRef } from "react";
import { countCorrect } from "../lib/game";
import { DIFFICULTY_SETTINGS, QUIZ_REGIONS } from "../lib/quiz";
import type { Question, QuizCondition } from "../lib/quiz";
import type { Anthem } from "../lib/schema";

type Props = {
  condition: QuizCondition;
  questions: readonly Question[];
  answers: readonly (string | null)[];
  anthemsById: ReadonlyMap<string, Anthem>;
  onRetry: () => void;
  onBack: () => void;
};

export function ResultScreen({
  condition,
  questions,
  answers,
  anthemsById,
  onRetry,
  onBack,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const score = countCorrect(questions, answers);
  const regionLabel = QUIZ_REGIONS.find((r) => r.value === condition.region)?.label;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="result-heading">
      <h2 id="result-heading" ref={headingRef} tabIndex={-1}>
        結果
      </h2>
      <p className="hint">
        {regionLabel}・{DIFFICULTY_SETTINGS[condition.difficulty].label}
      </p>
      <p className="score">
        <strong>{score}</strong> / {questions.length} 問正解
      </p>

      <ol className="result-list">
        {questions.map((q, i) => {
          const correct = anthemsById.get(q.answerId)!;
          const chosen = answers[i] ? anthemsById.get(answers[i]) : undefined;
          const ok = answers[i] === q.answerId;
          return (
            <li key={q.answerId} className={ok ? "result-correct" : "result-wrong"}>
              <span aria-hidden="true">{ok ? "○" : "×"}</span> {correct.nameJa}
              {!ok && chosen && <span className="hint">（あなたの回答：{chosen.nameJa}）</span>}
            </li>
          );
        })}
      </ol>

      <div className="actions">
        <button type="button" className="button button-primary button-large" onClick={onRetry}>
          同じモードでもう一度
        </button>
        <button type="button" className="button" onClick={onBack}>
          モード選択へ戻る
        </button>
      </div>
    </section>
  );
}
