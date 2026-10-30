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

/** 難易度ごとの出題ルール。秒数などの調整はここだけを変更すればよい（仮設定）。 */
export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySetting> = {
  1: {
    label: "初級",
    clip: { start: "beginning", durationSec: 15 },
    preferSimilarDistractors: false,
  },
  2: {
    label: "中級",
    clip: { start: "beginning", durationSec: 10 },
    preferSimilarDistractors: false,
  },
  3: { label: "上級", clip: { start: "random", durationSec: 5 }, preferSimilarDistractors: false },
  4: { label: "超級", clip: { start: "random", durationSec: 3 }, preferSimilarDistractors: true },
};
