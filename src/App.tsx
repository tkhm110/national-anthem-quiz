/**
 * Phase 1 の仮画面。本番データの読み込み結果と、28モードの出題可能数を表示するだけ。
 * クイズ画面と状態遷移は Phase 3 で実装する。
 */
import { loadBundledDataset } from "./lib/data/bundled";
import {
  DIFFICULTIES,
  DIFFICULTY_SETTINGS,
  QUIZ_REGIONS,
  countAvailableQuestions,
} from "./lib/quiz";

const dataset = loadBundledDataset();

export function App() {
  const { anthems, melodyGroups } = dataset;
  return (
    <main
      style={{ fontFamily: "sans-serif", padding: "16px", maxWidth: "720px", margin: "0 auto" }}
    >
      <h1>国歌クイズ（開発中）</h1>
      <p>
        収録国: {anthems.length}件 / 旋律グループ: {melodyGroups.length}件
      </p>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>地域</th>
            {DIFFICULTIES.map((d) => (
              <th key={d} style={{ padding: "0 8px" }}>
                {DIFFICULTY_SETTINGS[d].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {QUIZ_REGIONS.map((region) => (
            <tr key={region.value}>
              <td>{region.label}</td>
              {DIFFICULTIES.map((difficulty) => {
                const count = countAvailableQuestions(anthems, melodyGroups, {
                  region: region.value,
                  difficulty,
                });
                return (
                  <td key={difficulty} style={{ textAlign: "center" }}>
                    {count > 0 ? `${count}問` : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p>「—」はまだ4択を作れない組み合わせです。</p>
    </main>
  );
}
