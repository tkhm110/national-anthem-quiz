import type { Anthem, Country, Difficulty, MelodyGroup } from "../schema";
import { shuffle, type Rng } from "../random";
import { computeClip, type Clip } from "./clip";
import { DIFFICULTY_SETTINGS, MAX_QUESTIONS, type DifficultySetting } from "./config";
import { buildMelodyRelations, type MelodyRelations } from "./melody";
import { isInQuizRegion, type QuizRegion } from "./modes";

/** 出題に使うデータ。収録している国歌（anthems）と、世界の国の一覧（countries）は別に持つ */
export type QuizData = {
  anthems: readonly Anthem[];
  countries: readonly Country[];
  melodyGroups: readonly MelodyGroup[];
};

export type QuizCondition = {
  region: QuizRegion;
  difficulty: Difficulty;
};

export type QuizOptions = QuizCondition & {
  /** 既定・上限は MAX_QUESTIONS（10）。上限を超える値は RangeError で拒否する。 */
  maxQuestions?: number;
  rng: Rng;
};

export type Question = {
  answerId: string;
  /** 選択肢：正解を含む、互いに異なる国ID（表示順）。収録していない国も含みうる。記述式の問題では空 */
  choiceIds: string[];
  /**
   * 正解として認める国ID。選択式では正解の国だけ。
   * 記述式では、正解の国と同じ旋律（identical）の国も含む（音だけでは区別できないため。収録していない国も含む）。
   */
  acceptedIds: string[];
  clip: Clip;
};

export type QuizSessionResult =
  | { ok: true; questions: Question[]; totalQuestions: number }
  /** INSUFFICIENT_POOL：出題できる国が足りない / MODE_UNAVAILABLE：まだ遊べないモード（準備中） */
  | { ok: false; reason: "INSUFFICIENT_POOL" | "MODE_UNAVAILABLE" };

function resolveMaxQuestions(options: { maxQuestions?: number }): number {
  const maxQuestions = options.maxQuestions ?? MAX_QUESTIONS;
  if (!Number.isInteger(maxQuestions) || maxQuestions < 1 || maxQuestions > MAX_QUESTIONS) {
    throw new RangeError(
      `maxQuestions は 1〜${MAX_QUESTIONS} の整数にしてください: ${maxQuestions}`,
    );
  }
  return maxQuestions;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** ID → 国。重複があれば例外（検証を経ないデータの誤用を防ぐ） */
function indexCountries(countries: readonly Country[]): Map<string, Country> {
  const map = new Map<string, Country>();
  for (const country of countries) {
    if (map.has(country.id)) throw new Error(`国ID "${country.id}" が重複しています`);
    map.set(country.id, country);
  }
  return map;
}

function matchesPool(country: Country, pool: DifficultySetting["answerPool"]): boolean {
  if (pool === "all") return true;
  return pool === "famous" ? country.famous === true : country.famous !== true;
}

/**
 * 正解にできる国歌（選んだ地域・難易度に合う収録国）。入力順に結果が左右されないよう ID 順に並べる。
 * 初級は知名度が高い国、中級はそれ以外（重ならない）、上級・超級は地域のすべての収録国。
 */
export function filterByCondition(data: QuizData, condition: QuizCondition): Anthem[] {
  const countries = indexCountries(data.countries);
  const pool = DIFFICULTY_SETTINGS[condition.difficulty].answerPool;
  const seen = new Set<string>();
  return data.anthems
    .filter((anthem) => {
      if (seen.has(anthem.id)) throw new Error(`国ID "${anthem.id}" が重複しています`);
      seen.add(anthem.id);
      const country = countries.get(anthem.id);
      if (!country) throw new Error(`国 "${anthem.id}" が国の一覧にありません`);
      return isInQuizRegion(condition.region, country.region) && matchesPool(country, pool);
    })
    .sort(byId);
}

/** 誤答の候補：選んだ地域のすべての国（収録していない国を含む）。ID 順 */
function regionCountries(countries: readonly Country[], region: QuizRegion): Country[] {
  return countries.filter((c) => isInQuizRegion(region, c.region)).sort(byId);
}

/**
 * 正解にできる国を返す。
 * - 記述式：条件に合う国すべて（選択肢を作らないので、国の数の条件はない）
 * - 選択式：選択肢全体で同一旋律クラスが重ならないことが条件。正解も地域の国のどれかのクラスに属するので、
 *   「地域の国のクラス数 >= 選択肢の数」なら全員が正解になれ、そうでなければ0件になる。
 */
function eligibleAnswersFrom(
  candidates: readonly Anthem[],
  distractorPool: readonly Country[],
  relations: MelodyRelations,
  setting: DifficultySetting,
): Anthem[] {
  if (setting.answerFormat === "text") return [...candidates];
  const classes = new Set(distractorPool.map((c) => relations.identicalClassOf(c.id)));
  return classes.size >= setting.choiceCount ? [...candidates] : [];
}

/** 有効な正解候補（その条件で正解にできる国）の一覧 */
export function findEligibleAnswers(data: QuizData, condition: QuizCondition): Anthem[] {
  return eligibleAnswersFrom(
    filterByCondition(data, condition),
    regionCountries(data.countries, condition.region),
    buildMelodyRelations(data.melodyGroups),
    DIFFICULTY_SETTINGS[condition.difficulty],
  );
}

/**
 * その条件で出題される問題数（0 なら開始不可）。準備中のモードは 0。
 * generateSession と同じ判定を使うので、表示する問題数と実際の問題数は必ず一致する。
 */
export function countAvailableQuestions(
  data: QuizData,
  condition: QuizCondition & { maxQuestions?: number },
): number {
  const maxQuestions = resolveMaxQuestions(condition);
  if (!DIFFICULTY_SETTINGS[condition.difficulty].available) return 0;
  return Math.min(findEligibleAnswers(data, condition).length, maxQuestions);
}

/**
 * 誤答を選ぶ。候補は選んだ地域のすべての国（収録していない国を含む）で、次の順に優先する。
 * 1. 上級：正解と類似旋律グループを直接共有する国
 * 2. 初級・中級：正解と同じ分類（知名度が高い／それ以外）の国。
 *    分類が違う国が混ざると、聴かなくても消去法で答えが分かってしまうため
 * 3. 残りの国
 * 同じ順位の中は乱数で並べる。同一旋律の除外はどの優先よりも強い。
 */
function pickDistractors(
  answer: Country,
  distractorPool: readonly Country[],
  relations: MelodyRelations,
  setting: DifficultySetting,
  rng: Rng,
): Country[] {
  const count = setting.choiceCount - 1;
  const priority = (c: Country) =>
    (setting.preferSimilarDistractors && relations.isSimilar(answer.id, c.id) ? 0 : 2) +
    (setting.answerPool !== "all" && matchesPool(c, setting.answerPool) ? 0 : 1);
  const ordered = shuffle(
    distractorPool.filter((c) => c.id !== answer.id),
    rng,
  )
    .map((country) => ({ country, rank: priority(country) }))
    // Array.prototype.sort は安定ソートなので、同じ順位の中ではシャッフルの順が保たれる
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.country);

  const usedClasses = new Set([relations.identicalClassOf(answer.id)]);
  const picked: Country[] = [];
  for (const candidate of ordered) {
    if (picked.length === count) break;
    const melodyClass = relations.identicalClassOf(candidate.id);
    if (usedClasses.has(melodyClass)) continue;
    usedClasses.add(melodyClass);
    picked.push(candidate);
  }
  if (picked.length < count) {
    // eligibleAnswersFrom で成立性を確認済みなので、ここに来たらバグ
    throw new Error(`国 "${answer.id}" の誤答を ${count} 件選べませんでした`);
  }
  return picked;
}

/**
 * 1プレイ分の問題列を生成して固定する。
 * - 正解は選んだ地域・難易度に合う収録国から選ぶ。誤答は選んだ地域の国（収録していない国を含む）から選ぶ。
 *   ほかの地域へは広げない
 * - 最大 maxQuestions 問。足りなければ成立する問題数だけ。0 問なら INSUFFICIENT_POOL
 * - 準備中のモードは MODE_UNAVAILABLE
 * - 正解国はセッション内で重複しない（誤答としての再登場は許可）
 * - 記述式（超級）は選択肢を作らず、同じ旋律の国も正解として認める
 * - 同じデータ・条件・乱数列なら同じ結果になる（入力の並び順にも左右されない）
 */
export function generateSession(data: QuizData, options: QuizOptions): QuizSessionResult {
  const maxQuestions = resolveMaxQuestions(options);
  const setting = DIFFICULTY_SETTINGS[options.difficulty];
  if (!setting.available) return { ok: false, reason: "MODE_UNAVAILABLE" };
  const { rng } = options;
  const countries = indexCountries(data.countries);
  const relations = buildMelodyRelations(data.melodyGroups);
  const candidates = filterByCondition(data, options);
  const distractorPool = regionCountries(data.countries, options.region);
  const eligible = eligibleAnswersFrom(candidates, distractorPool, relations, setting);
  if (eligible.length === 0) return { ok: false, reason: "INSUFFICIENT_POOL" };

  const allCountries = [...data.countries].sort(byId);
  const answers = shuffle(eligible, rng).slice(0, maxQuestions);
  const questions = answers.map((answer): Question => {
    if (setting.answerFormat === "text") {
      // 同じ旋律の国は、地域や収録の有無によらず正解として認める（音だけでは区別できないため）
      const answerClass = relations.identicalClassOf(answer.id);
      const acceptedIds = allCountries
        .filter((c) => relations.identicalClassOf(c.id) === answerClass)
        .map((c) => c.id);
      const clip = computeClip(answer.audio.durationSec, setting.clip, rng);
      return { answerId: answer.id, choiceIds: [], acceptedIds, clip };
    }
    const distractors = pickDistractors(
      countries.get(answer.id)!,
      distractorPool,
      relations,
      setting,
      rng,
    );
    const choiceIds = shuffle([answer.id, ...distractors.map((d) => d.id)], rng);
    const clip = computeClip(answer.audio.durationSec, setting.clip, rng);
    return { answerId: answer.id, choiceIds, acceptedIds: [answer.id], clip };
  });
  return { ok: true, questions, totalQuestions: questions.length };
}
