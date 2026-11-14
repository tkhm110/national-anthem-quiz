import { useState } from "react";
import {
  DIFFICULTIES,
  DIFFICULTY_SETTINGS,
  QUIZ_REGIONS,
  countAvailableQuestions,
  quizRegionLabel,
} from "../lib/quiz";
import type { QuizCondition, QuizData, QuizRegion } from "../lib/quiz";
import type { Difficulty } from "../lib/schema";

type Props = {
  data: QuizData;
  onStart: (condition: QuizCondition) => void;
};

/**
 * 地域 × 難易度の選択画面。出題できない組み合わせは選べないようにし、理由を表示する。
 * 表示する問題数は generateSession と同じ判定（countAvailableQuestions）で計算する。
 */
export function ModeSelect({ data, onStart }: Props) {
  const [region, setRegion] = useState<QuizRegion>("world");
  const [difficulty, setDifficulty] = useState<Difficulty>(1);

  const count = (r: QuizRegion, d: Difficulty) =>
    countAvailableQuestions(data, { region: r, difficulty: d });
  const selectedCount = count(region, difficulty);
  const selectedAvailable = DIFFICULTY_SETTINGS[difficulty].available;
  const regionLabel = quizRegionLabel(region);

  return (
    <section aria-labelledby="mode-heading">
      <h2 id="mode-heading">モードを選ぶ</h2>
      <p className="hint">地域と難易度の組み合わせを選んでください。数字は出題される問題数です。</p>
      <p className="hint">
        初級はよく知られた国、中級はそれ以外の国から4択で出題します。
        上級はすべての国から8択、超級はすべての国から出題し、国名を入力して、表示される候補から選んで答えます。
      </p>

      <div className="mode-table-wrap">
        <table className="mode-table">
          <thead>
            <tr>
              <th scope="col">地域</th>
              {DIFFICULTIES.map((d) => (
                <th key={d} scope="col">
                  {DIFFICULTY_SETTINGS[d].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {QUIZ_REGIONS.map((r) => (
              <tr key={r.value}>
                <th scope="row">{r.label}</th>
                {DIFFICULTIES.map((d) => {
                  const n = count(r.value, d);
                  const selected = r.value === region && d === difficulty;
                  const status = !DIFFICULTY_SETTINGS[d].available
                    ? "準備中"
                    : n > 0
                      ? `${n}問`
                      : "まだ遊べません";
                  return (
                    <td key={d}>
                      <button
                        type="button"
                        className="mode-cell"
                        aria-pressed={selected}
                        aria-label={`${r.label}・${DIFFICULTY_SETTINGS[d].label}：${status}`}
                        onClick={() => {
                          setRegion(r.value);
                          setDifficulty(d);
                        }}
                      >
                        {status === "まだ遊べません" ? "—" : status}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mode-summary" aria-live="polite">
        <p>
          選択中：<strong>{regionLabel}</strong>・
          <strong>{DIFFICULTY_SETTINGS[difficulty].label}</strong>
          {selectedCount > 0 ? `（${selectedCount}問）` : ""}
        </p>
        {!selectedAvailable && (
          <p className="notice">
            {DIFFICULTY_SETTINGS[difficulty].label}
            （国名を入力して答える形式）は準備中です。
          </p>
        )}
        {selectedAvailable && selectedCount === 0 && (
          <p className="notice">この地域・難易度で出題できる国歌は、まだ収録していません。</p>
        )}
      </div>

      <button
        type="button"
        className="button button-primary button-large"
        disabled={selectedCount === 0}
        onClick={() => onStart({ region, difficulty })}
      >
        スタート
      </button>
    </section>
  );
}
