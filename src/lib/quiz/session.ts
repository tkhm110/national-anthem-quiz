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
  /** 4択の選択肢：正解を含む、互いに異なる国ID（表示順）。記述式の問題では空 */
  choiceIds: string[];
  /**
   * 正解として認める国ID。4択では正解の国だけ。
   * 記述式では、正解の国と同じ旋律（identical）の国も含む（音だけでは区別できないため）。
   */
  acceptedIds: string[];
  clip: Clip;
};

export type QuizSessionResult =
  | { ok: true; questions: Question[]; totalQuestions: number }
  /** INSUFFICIENT_POOL：出題できる国が足りない / MODE_UNAVAILABLE：まだ遊べないモード（準備中） */
  | { ok: false; reason: "INSUFFICIENT_POOL" | "MODE_UNAVAILABLE" };

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
 * 初級・中級・上級は、その難易度の国だけが対象（重ならない）。超級（4）はすべての難易度の国が対象。
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
    .filter((a) => condition.difficulty === 4 || a.difficulty === condition.difficulty)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 正解にできる国を返す。
 * - 記述式：条件に合う国すべて（選択肢を作らないので、国の数の条件はない）
 * - 4択：同じ候補集合から「互いに同一旋律でない」誤答を choiceCount-1 件選べる国だけ。
 *   選択肢全体で同一旋律クラスが重複しないことが条件なので、
 *   「自分以外の同一旋律クラスが choiceCount-1 個以上あるか」で判定できる。
 *   正解自身も候補集合のどれかのクラスに属するため、これは「候補集合のクラス数 >= choiceCount」と同値であり、
 *   結果は「候補全員」か「0件」のどちらかになる。
 */
function eligibleAnswersFrom(
  candidates: readonly Anthem[],
  relations: MelodyRelations,
  choiceCount: number,
  answerFormat: "choice" | "text",
): Anthem[] {
  if (answerFormat === "text") return [...candidates];
  const classes = new Set(candidates.map((a) => relations.identicalClassOf(a.id)));
  return classes.size >= choiceCount ? [...candidates] : [];
}

/** 有効な正解候補（その条件で正解にできる国）の一覧 */
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
    DIFFICULTY_SETTINGS[condition.difficulty].answerFormat,
  );
}

/**
 * その条件で出題される問題数（0 なら開始不可）。準備中のモードは 0。
 * generateSession と同じ判定を使うので、表示する問題数と実際の問題数は必ず一致する。
 */
export function countAvailableQuestions(
  pool: readonly Anthem[],
  melodyGroups: readonly MelodyGroup[],
  condition: QuizCondition & { maxQuestions?: number; choiceCount?: number },
): number {
  const { maxQuestions, choiceCount } = resolveLimits(condition);
  if (!DIFFICULTY_SETTINGS[condition.difficulty].available) return 0;
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
  // 上級：正解と類似旋律グループを直接共有する国を先に検討する（足りなければ残りから補充）
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
 * - 準備中のモードは MODE_UNAVAILABLE
 * - 正解国はセッション内で重複しない（誤答としての再登場は許可）
 * - 記述式（超級）は選択肢を作らず、同じ旋律の国も正解として認める
 * - 同じデータ・条件・乱数列なら同じ結果になる
 */
export function generateSession(
  pool: readonly Anthem[],
  melodyGroups: readonly MelodyGroup[],
  options: QuizOptions,
): QuizSessionResult {
  const { maxQuestions, choiceCount } = resolveLimits(options);
  const setting = DIFFICULTY_SETTINGS[options.difficulty];
  if (!setting.available) return { ok: false, reason: "MODE_UNAVAILABLE" };
  const { rng } = options;
  const relations = buildMelodyRelations(melodyGroups);
  const candidates = filterByCondition(pool, options);
  const eligible = eligibleAnswersFrom(candidates, relations, choiceCount, setting.answerFormat);
  if (eligible.length === 0) return { ok: false, reason: "INSUFFICIENT_POOL" };

  const answers = shuffle(eligible, rng).slice(0, maxQuestions);
  const questions = answers.map((answer): Question => {
    if (setting.answerFormat === "text") {
      // 同じ旋律の国は、地域や難易度によらず正解として認める（音だけでは区別できないため）
      const answerClass = relations.identicalClassOf(answer.id);
      const acceptedIds = pool
        .filter((a) => relations.identicalClassOf(a.id) === answerClass)
        .map((a) => a.id)
        .sort();
      const clip = computeClip(answer.audio.durationSec, setting.clip, rng);
      return { answerId: answer.id, choiceIds: [], acceptedIds, clip };
    }
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
    return { answerId: answer.id, choiceIds, acceptedIds: [answer.id], clip };
  });
  return { ok: true, questions, totalQuestions: questions.length };
}
