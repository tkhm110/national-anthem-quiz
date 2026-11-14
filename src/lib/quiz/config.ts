import type { Difficulty } from "../schema";

/** 1プレイの最大問題数（仕様上の上限） */
export const MAX_QUESTIONS = 10;

export type ClipSetting = {
  /** "beginning": 冒頭から / "random": 曲の途中（乱数で決定）から */
  start: "beginning" | "random";
  /** 再生する長さ（秒）。音源がこれより短ければ音源の長さに縮める。 */
  durationSec: number;
};

export type DifficultySetting = {
  label: string;
  /**
   * 正解にする国（選んだ地域の収録国のうち）。
   * "famous"：知名度が高い国（countries.json の famous） / "standard"：それ以外 / "all"：すべて
   */
  answerPool: "famous" | "standard" | "all";
  /** "choice"：選択式 / "text"：記述式（国名を入力し、表示される候補から選ぶ） */
  answerFormat: "choice" | "text";
  /** 選択式の選択肢の数（記述式では使わない） */
  choiceCount: number;
  /** false なら、このモードはまだ遊べない（準備中） */
  available: boolean;
  clip: ClipSetting;
  /** 誤答に「類似旋律」の国を優先するか（上級のみ） */
  preferSimilarDistractors: boolean;
};

/**
 * 再生区間（暫定）：全難易度で冒頭から60秒。
 * イントロで最初の数秒に何も流れない音源があり得るため、短い区間や途中からの再生は当面使わない。
 * 難易度ごとに変えたくなったら、各難易度の clip を個別に書き換える（"random" で途中から再生できる）。
 */
const DEFAULT_CLIP: ClipSetting = { start: "beginning", durationSec: 60 };

/**
 * 難易度ごとの出題ルール。秒数などの調整はここだけを変更すればよい。
 * 初級は知名度が高い国、中級はそれ以外の国から4択で出題する（重ならない）。
 * 上級は地域のすべての収録国から8択、超級は同じ範囲から記述式で出題する（国名を入力し、世界の国の一覧から出る候補を選ぶ）。
 * 誤答はどの難易度でも、選んだ地域の国（収録していない国を含む）から選ぶ（詳しくは session.ts）。
 * 新しいモードを作りかけのときは available: false にすると、画面に「準備中」と表示され、開始できなくなる。
 */
export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySetting> = {
  1: {
    label: "初級",
    answerPool: "famous",
    answerFormat: "choice",
    choiceCount: 4,
    available: true,
    clip: DEFAULT_CLIP,
    preferSimilarDistractors: false,
  },
  2: {
    label: "中級",
    answerPool: "standard",
    answerFormat: "choice",
    choiceCount: 4,
    available: true,
    clip: DEFAULT_CLIP,
    preferSimilarDistractors: false,
  },
  3: {
    label: "上級",
    answerPool: "all",
    answerFormat: "choice",
    choiceCount: 8,
    available: true,
    clip: DEFAULT_CLIP,
    preferSimilarDistractors: true,
  },
  4: {
    label: "超級",
    answerPool: "all",
    answerFormat: "text",
    choiceCount: 0,
    available: true,
    clip: DEFAULT_CLIP,
    preferSimilarDistractors: false,
  },
};
