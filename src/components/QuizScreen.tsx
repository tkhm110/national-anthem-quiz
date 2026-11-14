import { useEffect, useRef } from "react";
import { isCorrect } from "../lib/game";
import { DIFFICULTY_SETTINGS, quizRegionLabel } from "../lib/quiz";
import type { Question, QuizCondition } from "../lib/quiz";
import type { Anthem, Country } from "../lib/schema";
import { AudioPlayer } from "./AudioPlayer";
import { CountryAnswerInput } from "./CountryAnswerInput";

type Props = {
  condition: QuizCondition;
  questions: readonly Question[];
  index: number;
  answer: string | null;
  anthemsById: ReadonlyMap<string, Anthem>;
  /** 記述式の入力候補に使う、世界の国の一覧 */
  countries: readonly Country[];
  countryName: (countryId: string) => string;
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
  countries,
  countryName,
  audioUrl,
  onAnswer,
  onNext,
  onQuit,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const question = questions[index]!;
  const correct = anthemsById.get(question.answerId)!;
  const answered = answer !== null;
  const correctAnswer = isCorrect(question, answer);
  const isTextAnswer = question.choiceIds.length === 0;
  const isLast = index + 1 === questions.length;
  const regionLabel = quizRegionLabel(condition.region);

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

      {isTextAnswer ? (
        !answered && <CountryAnswerInput key={index} countries={countries} onSelect={onAnswer} />
      ) : (
        <ul className={question.choiceIds.length > 4 ? "choices choices-many" : "choices"}>
          {question.choiceIds.map((id) => {
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
                  {countryName(id)}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="feedback" role="status" aria-live="polite">
        {answered && (
          <>
            <p className={correctAnswer ? "result-correct" : "result-wrong"}>
              {correctAnswer ? "正解！" : "不正解…"}
            </p>
            {isTextAnswer && <p>あなたの回答：{countryName(answer)}</p>}
            <p>
              正解は <strong>{correct.nameJa}</strong> の「
              {correct.anthemTitle.ja ?? correct.anthemTitle.original}」です。
            </p>
            {isTextAnswer && question.acceptedIds.length > 1 && (
              <p className="hint">
                同じ旋律の国（{question.acceptedIds.map(countryName).join("・")}
                ）は、どれを答えても正解です。
              </p>
            )}
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
