import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { readDataDir } from "../scripts/lib/read-data-dir";
import { validateDataset, type ValidatedDataset } from "../src/lib/data/validate";
import {
  buildMelodyRelations,
  filterByCondition,
  type QuizCondition,
  type QuizSessionResult,
} from "../src/lib/quiz";
import type { Anthem, MelodyGroup } from "../src/lib/schema";

export const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));
export const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));

/** tests/fixtures の架空国データ（検証済み）を読み込む */
export function loadFixtureDataset(): ValidatedDataset {
  const { anthemFiles, melodyGroupsFile } = readDataDir(
    `${FIXTURES_DIR}anthems`,
    `${FIXTURES_DIR}melody-groups.json`,
  );
  const result = validateDataset(anthemFiles, melodyGroupsFile, "fixture");
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.data;
}

/** テスト用の架空国を1件作る。境界条件のテストでは fixture ではなくこれで任意の件数を作る。 */
export function makeAnthem(id: string, overrides: Partial<Anthem> = {}): Anthem {
  return {
    id,
    nameJa: `テスト国${id.toUpperCase()}`,
    nameEn: `Testland ${id.toUpperCase()}`,
    anthemTitle: { original: `Test Anthem ${id.toUpperCase()}` },
    region: "europe",
    difficulty: 1,
    audio: { file: `${id}.mp3`, durationSec: 60 },
    license: {
      type: "cc0",
      author: "Test fixture (not a real recording)",
      sourceUrl: `https://example.com/fixtures/${id}`,
    },
    ...overrides,
  };
}

/** "xa", "xb", ... のような重複しない2文字IDを n 件作る（"xk" を含む範囲でもテスト上は問題ない） */
export function makeIds(n: number): string[] {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return Array.from({ length: n }, (_, i) => `${letters[Math.floor(i / 26)]}${letters[i % 26]}`);
}

/**
 * どの条件でも成り立つべきセッションの性質をまとめて検査する。
 * 4択・正解を含む・重複なし・条件内・同一旋律の衝突なし・正解の重複なし・再生区間が音源内。
 */
export function expectValidSession(
  result: QuizSessionResult,
  pool: readonly Anthem[],
  groups: readonly MelodyGroup[],
  condition: QuizCondition,
  choiceCount = 4,
): asserts result is Extract<QuizSessionResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  const candidates = new Map(filterByCondition(pool, condition).map((a) => [a.id, a]));
  const relations = buildMelodyRelations(groups);

  expect(result.totalQuestions).toBe(result.questions.length);
  expect(result.totalQuestions).toBeGreaterThan(0);
  expect(result.totalQuestions).toBeLessThanOrEqual(10);

  const answerIds = result.questions.map((q) => q.answerId);
  expect(new Set(answerIds).size).toBe(answerIds.length);

  for (const question of result.questions) {
    expect(question.choiceIds).toHaveLength(choiceCount);
    expect(new Set(question.choiceIds).size).toBe(choiceCount);
    expect(question.choiceIds).toContain(question.answerId);

    for (const id of question.choiceIds) {
      // 正解・誤答とも条件（地域・難易度）を満たす国だけ
      expect(candidates.has(id), `${id} は条件外の国`).toBe(true);
    }

    const classes = question.choiceIds.map((id) => relations.identicalClassOf(id));
    expect(new Set(classes).size, `同一旋律の衝突: ${question.choiceIds.join(",")}`).toBe(
      choiceCount,
    );

    const audio = candidates.get(question.answerId)!.audio;
    const { startSec, durationSec } = question.clip;
    expect(startSec).toBeGreaterThanOrEqual(0);
    expect(durationSec).toBeGreaterThan(0);
    expect(startSec + durationSec).toBeLessThanOrEqual(audio.durationSec);
  }
}
