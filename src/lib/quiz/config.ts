import type { Difficulty } from "../schema";

/** 1プレイの最大問題数（仕様上の上限） */
export const MAX_QUESTIONS = 10;

/** 選択肢の数（MVP は4択固定） */
export const CHOICE_COUNT = 4;

export type ClipSetting = {
  /** "beginning": 冒頭から / "random": 曲の途中（乱数で決定）から */
  start: "beginning" | "random";
  /** 再生する長さ（秒）。音源がこれより短ければ音源の長さに縮める。 */
  durationSec: number;
};

export type DifficultySetting = {
  label: string;
  clip: ClipSetting;
  /** 誤答に「類似旋律」の国を優先するか（超級のみ） */
  preferSimilarDistractors: boolean;
};

/**
 * 再生区間（暫定）：全難易度で冒頭から60秒。
 * イントロで最初の数秒に何も流れない音源があり得るため、短い区間や途中からの再生は当面使わない。
 * 難易度ごとに変えたくなったら、各難易度の clip を個別に書き換える（"random" で途中から再生できる）。
 */
const DEFAULT_CLIP: ClipSetting = { start: "beginning", durationSec: 60 };

/** 難易度ごとの出題ルール。秒数などの調整はここだけを変更すればよい。 */
export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySetting> = {
  1: { label: "初級", clip: DEFAULT_CLIP, preferSimilarDistractors: false },
  2: { label: "中級", clip: DEFAULT_CLIP, preferSimilarDistractors: false },
  3: { label: "上級", clip: DEFAULT_CLIP, preferSimilarDistractors: false },
  4: { label: "超級", clip: DEFAULT_CLIP, preferSimilarDistractors: true },
};
