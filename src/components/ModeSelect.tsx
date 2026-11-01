import { useState } from "react";
import {
  DIFFICULTIES,
  DIFFICULTY_SETTINGS,
  QUIZ_REGIONS,
  countAvailableQuestions,
} from "../lib/quiz";
import type { QuizCondition } from "../lib/quiz";
import type { Anthem, Difficulty, MelodyGroup, QuizRegion } from "../lib/schema";

type Props = {
  anthems: readonly Anthem[];
  melodyGroups: readonly MelodyGroup[];
  onStart: (condition: QuizCondition) => void;
};

/**
 * 地域 × 難易度（28通り）の選択画面。4択を作れない組み合わせは選べないようにし、理由を表示する。
 * 表示する問題数は generateSession と同じ判定（countAvailableQuestions）で計算する。
 */
export function ModeSelect({ anthems, melodyGroups, onStart }: Props) {
  const [region, setRegion] = useState<QuizRegion>("world");
  const [difficulty, setDifficulty] = useState<Difficulty>(1);

  const count = (r: QuizRegion, d: Difficulty) =>
    countAvailableQuestions(anthems, melodyGroups, { region: r, difficulty: d });
  const selectedCount = count(region, difficulty);
  const regionLabel = QUIZ_REGIONS.find((r) => r.value === region)?.label ?? region;

  return (
    <section aria-labelledby="mode-heading">
      <h2 id="mode-heading">モードを選ぶ</h2>
      <p className="hint">地域と難易度の組み合わせを選んでください。数字は出題される問題数です。</p>

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
                  return (
                    <td key={d}>
                      <button
                        type="button"
                        className="mode-cell"
                        aria-pressed={selected}
                        aria-label={`${r.label}・${DIFFICULTY_SETTINGS[d].label}：${n > 0 ? `${n}問` : "まだ遊べません"}`}
                        onClick={() => {
                          setRegion(r.value);
                          setDifficulty(d);
                        }}
                      >
                        {n > 0 ? `${n}問` : "—"}
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
        {selectedCount === 0 && (
          <p className="notice">
            この地域・難易度ではまだ4択を作れません（互いに聴き分けられる国が4か国に足りません）。
          </p>
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
