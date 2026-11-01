/**
 * 画面の状態遷移（モード選択 → プレイ中 → 結果）。React に依存しない純粋な reducer。
 * 問題列は呼び出し側が generateSession で作って渡す（reducer の中で乱数を使わないため）。
 */
import type { Question, QuizCondition } from "../quiz";

export type GameState =
  | { phase: "select" }
  | {
      phase: "playing";
      condition: QuizCondition;
      questions: Question[];
      /** 今の問題の番号（0 始まり） */
      index: number;
      /** 各問題で選んだ国ID。未回答は null */
      answers: (string | null)[];
    }
  | {
      phase: "finished";
      condition: QuizCondition;
      questions: Question[];
      answers: (string | null)[];
    };

export type GameAction =
  | { type: "start"; condition: QuizCondition; questions: Question[] }
  | { type: "answer"; choiceId: string }
  | { type: "next" }
  | { type: "quit" };

export const initialGameState: GameState = { phase: "select" };

/**
 * 想定外の操作（回答済みの問題にもう一度答える、未回答で次へ進む等）は無視して、状態を変えない。
 * 開始後は地域・難易度・問題列を変更できない（start はモード選択画面か結果画面からだけ受け付ける）。
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "start": {
      if (state.phase === "playing" || action.questions.length === 0) return state;
      return {
        phase: "playing",
        condition: action.condition,
        questions: action.questions,
        index: 0,
        answers: action.questions.map(() => null),
      };
    }
    case "answer": {
      if (state.phase !== "playing") return state;
      const question = state.questions[state.index];
      if (!question || state.answers[state.index] !== null) return state;
      if (!question.choiceIds.includes(action.choiceId)) return state;
      const answers = [...state.answers];
      answers[state.index] = action.choiceId;
      return { ...state, answers };
    }
    case "next": {
      if (state.phase !== "playing" || state.answers[state.index] === null) return state;
      if (state.index + 1 < state.questions.length) return { ...state, index: state.index + 1 };
      return {
        phase: "finished",
        condition: state.condition,
        questions: state.questions,
        answers: state.answers,
      };
    }
    case "quit":
      // 途中終了の確認は UI で行い、承認された場合だけこの action を送る
      return initialGameState;
  }
}

/** 正答数 */
export function countCorrect(questions: readonly Question[], answers: readonly (string | null)[]) {
  return questions.filter((q, i) => answers[i] === q.answerId).length;
}
