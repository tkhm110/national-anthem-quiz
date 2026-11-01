import { describe, expect, it } from "vitest";
import { buildAudioUrl } from "../src/lib/audio";
import { countCorrect, gameReducer, initialGameState, type GameState } from "../src/lib/game";
import { generateSession, type Question, type QuizCondition } from "../src/lib/quiz";
import { mulberry32 } from "../src/lib/random";
import { loadFixtureDataset } from "./helpers";

const condition: QuizCondition = { region: "europe", difficulty: 1 };

function makeQuestions(n: number): Question[] {
  return Array.from({ length: n }, (_, i) => ({
    answerId: `a${i}`,
    choiceIds: [`a${i}`, "w1", "w2", "w3"],
    clip: { startSec: 0, durationSec: 60 },
  }));
}

function started(n = 3): Extract<GameState, { phase: "playing" }> {
  const state = gameReducer(initialGameState, {
    type: "start",
    condition,
    questions: makeQuestions(n),
  });
  if (state.phase !== "playing") throw new Error("not started");
  return state;
}

describe("gameReducer", () => {
  it("開始すると1問目・全問未回答になり、条件と問題列が固定される", () => {
    const state = started(3);
    expect(state.index).toBe(0);
    expect(state.answers).toEqual([null, null, null]);
    expect(state.condition).toEqual(condition);
    expect(state.questions).toHaveLength(3);
  });

  it("問題が0件なら開始しない", () => {
    const state = gameReducer(initialGameState, { type: "start", condition, questions: [] });
    expect(state).toBe(initialGameState);
  });

  it("プレイ中に start を送っても、条件や問題列は変わらない", () => {
    const state = started(3);
    const next = gameReducer(state, {
      type: "start",
      condition: { region: "asia", difficulty: 4 },
      questions: makeQuestions(5),
    });
    expect(next).toBe(state);
  });

  it("回答は1問につき1回だけ。選択肢にない国や、2回目の回答は無視する", () => {
    const state = started(3);
    expect(gameReducer(state, { type: "answer", choiceId: "zz" })).toBe(state);

    const answered = gameReducer(state, { type: "answer", choiceId: "w1" });
    expect(answered.phase === "playing" && answered.answers[0]).toBe("w1");
    expect(gameReducer(answered, { type: "answer", choiceId: "a0" })).toBe(answered);
  });

  it("未回答のまま次へは進めない", () => {
    const state = started(3);
    expect(gameReducer(state, { type: "next" })).toBe(state);
  });

  it("最後の問題に答えて次へ進むと結果になり、正答数を数えられる", () => {
    let state: GameState = started(3);
    for (const choiceId of ["a0", "w1", "a2"]) {
      state = gameReducer(state, { type: "answer", choiceId });
      state = gameReducer(state, { type: "next" });
    }
    expect(state.phase).toBe("finished");
    if (state.phase !== "finished") return;
    expect(state.answers).toEqual(["a0", "w1", "a2"]);
    expect(countCorrect(state.questions, state.answers)).toBe(2);
  });

  it("途中終了するとモード選択に戻り、進行状況は破棄される", () => {
    const state = gameReducer(started(3), { type: "answer", choiceId: "a0" });
    expect(gameReducer(state, { type: "quit" })).toEqual(initialGameState);
  });

  it("結果画面から同じ条件で再挑戦できる", () => {
    let state: GameState = started(1);
    state = gameReducer(state, { type: "answer", choiceId: "a0" });
    state = gameReducer(state, { type: "next" });
    const retry = gameReducer(state, { type: "start", condition, questions: makeQuestions(2) });
    expect(retry.phase).toBe("playing");
    expect(retry.phase === "playing" && retry.answers).toEqual([null, null]);
  });

  it("generateSession の問題列で最後まで遊べる（問題数の表示と一致する）", () => {
    const { anthems, melodyGroups } = loadFixtureDataset();
    const session = generateSession(anthems, melodyGroups, { ...condition, rng: mulberry32(1) });
    if (!session.ok) throw new Error("insufficient");
    let state = gameReducer(initialGameState, {
      type: "start",
      condition,
      questions: session.questions,
    });
    for (const q of session.questions) {
      state = gameReducer(state, { type: "answer", choiceId: q.answerId });
      state = gameReducer(state, { type: "next" });
    }
    expect(state.phase).toBe("finished");
    if (state.phase !== "finished") return;
    expect(countCorrect(state.questions, state.answers)).toBe(session.totalQuestions);
  });
});

describe("buildAudioUrl", () => {
  it("配信元の URL とファイル名をつなぐ（末尾のスラッシュの有無によらない）", () => {
    expect(buildAudioUrl("jp.mp3", "/audio/")).toBe("/audio/jp.mp3");
    expect(buildAudioUrl("jp.mp3", "https://cdn.example.com/audio")).toBe(
      "https://cdn.example.com/audio/jp.mp3",
    );
  });

  it.each([
    "../secret.mp3",
    "a/b.mp3",
    "/etc/passwd.mp3",
    ".hidden.mp3",
    "x..y.mp3",
    "jp.wav",
    "JP.mp3",
  ])("不正なファイル名 %s は拒否する", (name) => {
    expect(() => buildAudioUrl(name, "/audio/")).toThrow();
  });
});
