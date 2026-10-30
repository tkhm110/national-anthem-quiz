import type { Anthem, Difficulty, MelodyGroup, QuizRegion } from "../schema";
import { shuffle, type Rng } from "../random";
import { computeClip, type Clip } from "./clip";
import { CHOICE_COUNT, DIFFICULTY_SETTINGS, MAX_QUESTIONS } from "./config";
import { buildMelodyRelations, type MelodyRelations } from "./melody";

export type QuizCondition = {
  region: QuizRegion;
  difficulty: Difficulty;
};

export type QuizOptions = QuizCondition & {
  /** 既定・上限は MAX_QUESTIONS（10）。上限を超える値は RangeError で拒否する。 */
  maxQuestions?: number;
  /** 既定は CHOICE_COUNT（4）。 */
  choiceCount?: number;
  rng: Rng;
};

export type Question = {
  answerId: string;
  /** 正解を含む、互いに異なる国ID（表示順） */
  choiceIds: string[];
  clip: Clip;
};

export type QuizSessionResult =
  | { ok: true; questions: Question[]; totalQuestions: number }
  | { ok: false; reason: "INSUFFICIENT_POOL" };

type Limits = { maxQuestions: number; choiceCount: number };

function resolveLimits(options: { maxQuestions?: number; choiceCount?: number }): Limits {
  const maxQuestions = options.maxQuestions ?? MAX_QUESTIONS;
  const choiceCount = options.choiceCount ?? CHOICE_COUNT;
  if (!Number.isInteger(maxQuestions) || maxQuestions < 1 || maxQuestions > MAX_QUESTIONS) {
    throw new RangeError(
      `maxQuestions は 1〜${MAX_QUESTIONS} の整数にしてください: ${maxQuestions}`,
    );
  }
  if (!Number.isInteger(choiceCount) || choiceCount < 2) {
    throw new RangeError(`choiceCount は 2 以上の整数にしてください: ${choiceCount}`);
  }
  return { maxQuestions, choiceCount };
}

/**
 * 地域・難易度の条件に合う国（正解候補にも誤答候補にもなる集合）。
 * 難易度は累積方式：difficulty 以下の国がすべて対象。
 * 入力順に結果が左右されないよう ID 順に並べる。
 */
export function filterByCondition(pool: readonly Anthem[], condition: QuizCondition): Anthem[] {
  const ids = new Set<string>();
  for (const anthem of pool) {
    if (ids.has(anthem.id)) throw new Error(`国ID "${anthem.id}" が重複しています`);
    ids.add(anthem.id);
  }
  return pool
    .filter((a) => condition.region === "world" || a.region === condition.region)
    .filter((a) => a.difficulty <= condition.difficulty)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 正解にしたとき、同じ候補集合から「互いに同一旋律でない」誤答を choiceCount-1 件選べる国だけを返す。
 * 選択肢全体で同一旋律クラスが重複しないことが条件なので、
 * 「自分以外の同一旋律クラスが choiceCount-1 個以上あるか」で判定できる。
 * 正解自身も候補集合のどれかのクラスに属するため、これは「候補集合のクラス数 >= choiceCount」と同値であり、
 * 結果は「候補全員」か「0件」のどちらかになる。
 */
function eligibleAnswersFrom(
  candidates: readonly Anthem[],
  relations: MelodyRelations,
  choiceCount: number,
): Anthem[] {
  const classes = new Set(candidates.map((a) => relations.identicalClassOf(a.id)));
  return classes.size >= choiceCount ? [...candidates] : [];
}

/** 有効な正解候補（4択を構成できる正解国）の一覧 */
export function findEligibleAnswers(
  pool: readonly Anthem[],
  melodyGroups: readonly MelodyGroup[],
  condition: QuizCondition,
  choiceCount: number = CHOICE_COUNT,
): Anthem[] {
  const { choiceCount: count } = resolveLimits({ choiceCount });
  return eligibleAnswersFrom(
    filterByCondition(pool, condition),
    buildMelodyRelations(melodyGroups),
    count,
  );
}

/**
 * その条件で出題される問題数（0 なら開始不可）。
 * generateSession と同じ判定を使うので、表示する問題数と実際の問題数は必ず一致する。
 */
export function countAvailableQuestions(
  pool: readonly Anthem[],
  melodyGroups: readonly MelodyGroup[],
  condition: QuizCondition & { maxQuestions?: number; choiceCount?: number },
): number {
  const { maxQuestions, choiceCount } = resolveLimits(condition);
  return Math.min(
    findEligibleAnswers(pool, melodyGroups, condition, choiceCount).length,
    maxQuestions,
  );
}

function pickDistractors(
  answer: Anthem,
  candidates: readonly Anthem[],
  relations: MelodyRelations,
  count: number,
  preferSimilar: boolean,
  rng: Rng,
): Anthem[] {
  const shuffled = shuffle(
    candidates.filter((c) => c.id !== answer.id),
    rng,
  );
  // 超級：正解と類似旋律グループを直接共有する国を先に検討する（足りなければ残りから補充）
  const ordered = preferSimilar
    ? [
        ...shuffled.filter((c) => relations.isSimilar(answer.id, c.id)),
        ...shuffled.filter((c) => !relations.isSimilar(answer.id, c.id)),
      ]
    : shuffled;

  // 同一旋律の除外は類似優先よりも常に優先する
  const usedClasses = new Set([relations.identicalClassOf(answer.id)]);
  const picked: Anthem[] = [];
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
 * - 正解・誤答とも指定された地域・難易度の範囲だけから選ぶ（自動拡張しない）
 * - 最大 maxQuestions 問。足りなければ成立する問題数だけ。0 問なら INSUFFICIENT_POOL
 * - 正解国はセッション内で重複しない（誤答としての再登場は許可）
 * - 同じデータ・条件・乱数列なら同じ結果になる
 */
export function generateSession(
  pool: readonly Anthem[],
  melodyGroups: readonly MelodyGroup[],
  options: QuizOptions,
): QuizSessionResult {
  const { maxQuestions, choiceCount } = resolveLimits(options);
  const { rng } = options;
  const relations = buildMelodyRelations(melodyGroups);
  const candidates = filterByCondition(pool, options);
  const eligible = eligibleAnswersFrom(candidates, relations, choiceCount);
  if (eligible.length === 0) return { ok: false, reason: "INSUFFICIENT_POOL" };

  const setting = DIFFICULTY_SETTINGS[options.difficulty];
  const answers = shuffle(eligible, rng).slice(0, maxQuestions);
  const questions = answers.map((answer): Question => {
    const distractors = pickDistractors(
      answer,
      candidates,
      relations,
      choiceCount - 1,
      setting.preferSimilarDistractors,
      rng,
    );
    const choiceIds = shuffle([answer.id, ...distractors.map((d) => d.id)], rng);
    const clip = computeClip(answer.audio.durationSec, setting.clip, rng);
    return { answerId: answer.id, choiceIds, clip };
  });
  return { ok: true, questions, totalQuestions: questions.length };
}
