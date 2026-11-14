import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { readDataDir } from "../scripts/lib/read-data-dir";
import { validateDataset, type ValidatedDataset } from "../src/lib/data/validate";
import {
  DIFFICULTY_SETTINGS,
  buildMelodyRelations,
  filterByCondition,
  isInQuizRegion,
  type QuizCondition,
  type QuizData,
  type QuizSessionResult,
} from "../src/lib/quiz";
import type { Anthem, Country, MelodyGroup } from "../src/lib/schema";

export const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));
export const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));

/** tests/fixtures の架空国データ（検証済み）を読み込む */
export function loadFixtureDataset(): ValidatedDataset {
  const result = validateDataset(readDataDir(FIXTURES_DIR), "fixture");
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.data;
}

/** 本番データ（data/、検証済み）を読み込む */
export function loadProductionDataset(): ValidatedDataset {
  const result = validateDataset(readDataDir(DATA_DIR), "production");
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.data;
}

/** テスト用の架空国の国歌データを1件作る。境界条件のテストでは fixture ではなくこれで任意の件数を作る。 */
export function makeAnthem(id: string, overrides: Partial<Anthem> = {}): Anthem {
  return {
    id,
    nameJa: `テスト国${id.toUpperCase()}`,
    nameEn: `Testland ${id.toUpperCase()}`,
    anthemTitle: { original: `Test Anthem ${id.toUpperCase()}` },
    audio: { file: `${id}.mp3`, durationSec: 60 },
    license: {
      type: "cc0",
      author: "Test fixture (not a real recording)",
      sourceUrl: `https://example.com/fixtures/${id}`,
    },
    ...overrides,
  };
}

/** テスト用の架空国（国の一覧の1件）を作る。名前は makeAnthem と同じ */
export function makeCountry(id: string, overrides: Partial<Country> = {}): Country {
  return {
    id,
    nameJa: `テスト国${id.toUpperCase()}`,
    nameEn: `Testland ${id.toUpperCase()}`,
    region: "europe",
    aliases: [],
    ...overrides,
  };
}

export type CountrySpec = Partial<Country> & {
  /** false なら国歌を収録していない国（誤答や超級の答えにだけ使われる） */
  recorded?: boolean;
  audio?: Anthem["audio"];
};

/** 国ID → 指定から、出題用のデータを作る */
export function makeData(
  specs: Record<string, CountrySpec>,
  melodyGroups: MelodyGroup[] = [],
): QuizData {
  const entries = Object.entries(specs);
  return {
    countries: entries.map(([id, { recorded: _r, audio: _a, ...country }]) =>
      makeCountry(id, country),
    ),
    anthems: entries
      .filter(([, spec]) => spec.recorded !== false)
      .map(([id, spec]) => makeAnthem(id, spec.audio ? { audio: spec.audio } : {})),
    melodyGroups,
  };
}

/** "aa", "ab", ... のような重複しない2文字IDを n 件作る（"xk" を含む範囲でもテスト上は問題ない） */
export function makeIds(n: number): string[] {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return Array.from({ length: n }, (_, i) => `${letters[Math.floor(i / 26)]}${letters[i % 26]}`);
}

/**
 * どの条件でも成り立つべきセッションの性質をまとめて検査する。
 * 選択肢の数・正解を含む・重複なし・正解は条件内の収録国・誤答は地域内の国・同一旋律の衝突なし・
 * 正解の重複なし・再生区間が音源内。
 */
export function expectValidSession(
  result: QuizSessionResult,
  data: QuizData,
  condition: QuizCondition,
): asserts result is Extract<QuizSessionResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  const setting = DIFFICULTY_SETTINGS[condition.difficulty];
  const candidates = new Map(filterByCondition(data, condition).map((a) => [a.id, a]));
  const countries = new Map(data.countries.map((c) => [c.id, c]));
  const relations = buildMelodyRelations(data.melodyGroups);

  expect(result.totalQuestions).toBe(result.questions.length);
  expect(result.totalQuestions).toBeGreaterThan(0);
  expect(result.totalQuestions).toBeLessThanOrEqual(10);

  const answerIds = result.questions.map((q) => q.answerId);
  expect(new Set(answerIds).size).toBe(answerIds.length);

  for (const question of result.questions) {
    // 正解は条件（地域・難易度）を満たす収録国
    expect(candidates.has(question.answerId), `${question.answerId} は条件外の国`).toBe(true);
    expect(question.acceptedIds).toContain(question.answerId);

    if (setting.answerFormat === "text") {
      // 記述式：選択肢なし。同じ旋律の国（収録していない国を含む）だけを正解として認める
      expect(question.choiceIds).toEqual([]);
      const answerClass = relations.identicalClassOf(question.answerId);
      const sameClass = data.countries
        .filter((c) => relations.identicalClassOf(c.id) === answerClass)
        .map((c) => c.id)
        .sort();
      expect(question.acceptedIds).toEqual(sameClass);
    } else {
      const n = setting.choiceCount;
      expect(question.acceptedIds).toEqual([question.answerId]);
      expect(question.choiceIds).toHaveLength(n);
      expect(new Set(question.choiceIds).size).toBe(n);
      expect(question.choiceIds).toContain(question.answerId);

      for (const id of question.choiceIds) {
        // 誤答も選んだ地域の国だけ（収録していない国は可）
        const country = countries.get(id);
        expect(country, `${id} は国の一覧にない`).toBeDefined();
        expect(isInQuizRegion(condition.region, country!.region), `${id} は地域外の国`).toBe(true);
      }

      const classes = question.choiceIds.map((id) => relations.identicalClassOf(id));
      expect(new Set(classes).size, `同一旋律の衝突: ${question.choiceIds.join(",")}`).toBe(n);
    }

    const audio = candidates.get(question.answerId)!.audio;
    const { startSec, durationSec } = question.clip;
    expect(startSec).toBeGreaterThanOrEqual(0);
    expect(durationSec).toBeGreaterThan(0);
    expect(startSec + durationSec).toBeLessThanOrEqual(audio.durationSec);
  }
}
