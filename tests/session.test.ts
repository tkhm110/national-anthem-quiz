import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/lib/random";
import {
  DIFFICULTIES,
  QUIZ_REGIONS,
  countAvailableQuestions,
  filterByCondition,
  findEligibleAnswers,
  generateSession,
  type QuizCondition,
} from "../src/lib/quiz";
import type { Anthem, MelodyGroup } from "../src/lib/schema";
import { expectValidSession, loadFixtureDataset, makeAnthem, makeIds } from "./helpers";

const { anthems, melodyGroups } = loadFixtureDataset();
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

function ids(list: readonly Anthem[]): string[] {
  return list.map((a) => a.id);
}

function syntheticPool(n: number, overrides: Partial<Anthem> = {}): Anthem[] {
  return makeIds(n).map((id) => makeAnthem(id, overrides));
}

function identical(...countryIds: string[]): MelodyGroup {
  return {
    id: `identical-${countryIds.join("-")}`,
    relationType: "identical",
    countryIds,
    description: "t",
  };
}

function similar(...countryIds: string[]): MelodyGroup {
  return {
    id: `similar-${countryIds.join("-")}`,
    relationType: "similar",
    countryIds,
    description: "t",
  };
}

describe("条件フィルター（地域・累積難易度）", () => {
  it("難易度は累積方式：初級の国は上位難易度でも候補になる", () => {
    const europe = (difficulty: 1 | 2 | 3 | 4) =>
      ids(filterByCondition(anthems, { region: "europe", difficulty }));
    expect(europe(1)).toEqual(["xa", "xb", "xc", "xd", "xe"]);
    expect(europe(2)).toEqual(["xa", "xb", "xc", "xd", "xe", "xf"]);
    expect(europe(3)).toEqual(["xa", "xb", "xc", "xd", "xe", "xf", "xg"]);
    expect(europe(4)).toEqual(["xa", "xb", "xc", "xd", "xe", "xf", "xg", "xh"]);
  });

  it("世界モードは地域を問わない", () => {
    expect(filterByCondition(anthems, { region: "world", difficulty: 4 })).toHaveLength(18);
    expect(ids(filterByCondition(anthems, { region: "world", difficulty: 1 }))).toEqual([
      "xa",
      "xb",
      "xc",
      "xd",
      "xe",
      "xi",
      "xn",
      "xp",
      "xq",
      "xr",
      "xs",
    ]);
  });

  it("入力に同じIDが2件あれば例外（検証を経ないデータの誤用を防ぐ）", () => {
    expect(() =>
      filterByCondition([makeAnthem("xa"), makeAnthem("xa")], { region: "world", difficulty: 1 }),
    ).toThrow(/重複/);
  });
});

describe("出題可能数（fixture の代表ケース）", () => {
  const count = (region: QuizCondition["region"], difficulty: 1 | 2 | 3 | 4) =>
    countAvailableQuestions(anthems, melodyGroups, { region, difficulty });

  it.each([
    // [地域, 難易度, 期待する問題数, 理由]
    ["europe", 1, 5, "5か国・4旋律クラス（xa=xb）"],
    ["europe", 2, 6, "6か国・5クラス"],
    ["europe", 3, 7, "xg は xa=xb と同一クラス"],
    ["europe", 4, 8, "8か国すべて"],
    ["asia", 1, 0, "1か国のみ"],
    ["asia", 3, 0, "3か国のみ"],
    ["asia", 4, 4, "ちょうど4か国"],
    ["africa", 4, 0, "2か国しかない（他地域へ拡張しない）"],
    ["north-america", 1, 0, "4か国あるが xp=xq で3クラスしかない"],
    ["north-america", 4, 0, "同上"],
    ["south-america", 4, 0, "0か国"],
    ["oceania", 1, 0, "0か国"],
    ["world", 1, 10, "11か国が成立するが上限10問"],
    ["world", 4, 10, "18か国 → 上限10問"],
  ] as const)("%s × 難易度%s → %s問（%s）", (region, difficulty, expected, _reason) => {
    expect(count(region, difficulty)).toBe(expected);
  });

  it("地域・難易度の国数と出題可能数は一致しない場合がある（同一旋律の影響）", () => {
    const condition = { region: "north-america", difficulty: 1 } as const;
    expect(filterByCondition(anthems, condition)).toHaveLength(4);
    expect(findEligibleAnswers(anthems, melodyGroups, condition)).toEqual([]);
  });
});

describe("generateSession：全28モード × 複数シード", () => {
  for (const region of QUIZ_REGIONS) {
    for (const difficulty of DIFFICULTIES) {
      const condition: QuizCondition = { region: region.value, difficulty };
      it(`${region.label} × 難易度${difficulty}`, () => {
        const expected = countAvailableQuestions(anthems, melodyGroups, condition);
        for (const seed of SEEDS) {
          const result = generateSession(anthems, melodyGroups, {
            ...condition,
            rng: mulberry32(seed),
          });
          if (expected === 0) {
            expect(result).toEqual({ ok: false, reason: "INSUFFICIENT_POOL" });
          } else {
            expectValidSession(result, anthems, melodyGroups, condition);
            // 表示する問題数と実際に生成される問題数が一致する
            expect(result.totalQuestions).toBe(expected);
          }
        }
      });
    }
  }
});

describe("generateSession：問題の公正さ", () => {
  it("同一旋律の国（xa, xb, xg）は同じ4択に2件以上並ばない", () => {
    const condition = { region: "europe", difficulty: 3 } as const;
    for (const seed of SEEDS) {
      const result = generateSession(anthems, melodyGroups, {
        ...condition,
        rng: mulberry32(seed),
      });
      expectValidSession(result, anthems, melodyGroups, condition);
      for (const q of result.questions) {
        expect(
          q.choiceIds.filter((id) => ["xa", "xb", "xg"].includes(id)).length,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("同一旋律の国も、別の問題では正解になれる", () => {
    const result = generateSession(anthems, melodyGroups, {
      region: "europe",
      difficulty: 3,
      rng: mulberry32(1),
    });
    expectValidSession(result, anthems, melodyGroups, { region: "europe", difficulty: 3 });
    expect(result.questions.map((q) => q.answerId)).toEqual(
      expect.arrayContaining(["xa", "xb", "xg"]),
    );
  });

  it("正解は1件、選択肢の並び順も乱数で変わる（正解の位置が固定されない）", () => {
    const positions = new Set<number>();
    for (const seed of SEEDS) {
      const result = generateSession(anthems, melodyGroups, {
        region: "world",
        difficulty: 4,
        rng: mulberry32(seed),
      });
      if (!result.ok) throw new Error("unexpected");
      for (const q of result.questions) positions.add(q.choiceIds.indexOf(q.answerId));
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe("generateSession：超級の類似旋律優先", () => {
  const condition = { region: "europe", difficulty: 4 } as const;

  it("正解と類似グループを直接共有する国は必ず誤答に入る", () => {
    for (const seed of SEEDS) {
      const result = generateSession(anthems, melodyGroups, {
        ...condition,
        rng: mulberry32(seed),
      });
      expectValidSession(result, anthems, melodyGroups, condition);
      for (const q of result.questions) {
        if (q.answerId === "xc") expect(q.choiceIds).toContain("xh");
        if (q.answerId === "xd") expect(q.choiceIds).toContain("xh");
        if (q.answerId === "xh") expect(q.choiceIds).toEqual(expect.arrayContaining(["xc", "xd"]));
      }
    }
  });

  it("類似候補どうしが同一旋律なら、同一旋律の除外を優先して1件だけ入れる", () => {
    const pool = syntheticPool(6, { difficulty: 4 }); // aa..af
    const groups = [similar("aa", "ab", "ac"), identical("ab", "ac")];
    for (const seed of SEEDS) {
      const result = generateSession(pool, groups, { ...condition, rng: mulberry32(seed) });
      expectValidSession(result, pool, groups, condition);
      const q = result.questions.find((x) => x.answerId === "aa")!;
      expect(q.choiceIds.filter((id) => id === "ab" || id === "ac")).toHaveLength(1);
    }
  });

  it("類似候補が足りなければ同じ条件内の国で補充する", () => {
    const pool = syntheticPool(5, { difficulty: 4 });
    const groups = [similar("aa", "ab")];
    const result = generateSession(pool, groups, { ...condition, rng: mulberry32(3) });
    expectValidSession(result, pool, groups, condition);
    const q = result.questions.find((x) => x.answerId === "aa")!;
    expect(q.choiceIds).toContain("ab");
  });

  it("類似候補が条件外（別地域）なら誤答に入れない", () => {
    const pool = [
      ...syntheticPool(4, { difficulty: 4 }),
      makeAnthem("zz", { region: "asia", difficulty: 1 }),
    ];
    const groups = [similar("aa", "zz")];
    const result = generateSession(pool, groups, { ...condition, rng: mulberry32(3) });
    expectValidSession(result, pool, groups, condition);
    expect(result.questions.flatMap((q) => q.choiceIds)).not.toContain("zz");
  });
});

describe("generateSession：問題数と境界条件", () => {
  const condition = { region: "europe", difficulty: 1 } as const;
  const run = (pool: Anthem[], groups: MelodyGroup[] = [], seed = 1, extra = {}) =>
    generateSession(pool, groups, { ...condition, rng: mulberry32(seed), ...extra });

  it("空データ → INSUFFICIENT_POOL", () => {
    expect(run([])).toEqual({ ok: false, reason: "INSUFFICIENT_POOL" });
  });

  it("3か国 → INSUFFICIENT_POOL", () => {
    expect(run(syntheticPool(3))).toEqual({ ok: false, reason: "INSUFFICIENT_POOL" });
  });

  it("ちょうど4か国 → 4問、毎問その4か国すべてが選択肢", () => {
    const pool = syntheticPool(4);
    const result = run(pool);
    expectValidSession(result, pool, [], condition);
    expect(result.totalQuestions).toBe(4);
    for (const q of result.questions) expect([...q.choiceIds].sort()).toEqual(ids(pool));
  });

  it("10か国 → 10問（全か国が1回ずつ正解）", () => {
    const pool = syntheticPool(10);
    const result = run(pool);
    expectValidSession(result, pool, [], condition);
    expect([...result.questions.map((q) => q.answerId)].sort()).toEqual(ids(pool));
  });

  it("11か国 → 10問（正解の重複なし）", () => {
    const pool = syntheticPool(11);
    for (const seed of SEEDS) {
      const result = run(pool, [], seed);
      expectValidSession(result, pool, [], condition);
      expect(result.totalQuestions).toBe(10);
    }
  });

  it("国が十分あっても同一旋律だらけなら INSUFFICIENT_POOL", () => {
    const pool = syntheticPool(8);
    const groups = [
      identical("aa", "ab", "ac", "ad"),
      identical("ae", "af", "ag"),
      identical("ag", "ah"),
    ];
    // 2クラスしかない
    expect(run(pool, groups)).toEqual({ ok: false, reason: "INSUFFICIENT_POOL" });
  });

  it("ちょうど4クラスなら成立し、同じクラスの国は同じ4択に並ばない", () => {
    const pool = syntheticPool(7);
    const groups = [identical("aa", "ab", "ac"), identical("ad", "ae")];
    for (const seed of SEEDS) {
      const result = run(pool, groups, seed);
      expectValidSession(result, pool, groups, condition);
      expect(result.totalQuestions).toBe(7);
    }
  });

  it("地域に2か国しかなければ、他地域に十分な国があっても拡張しない", () => {
    const pool = [
      ...syntheticPool(10, { region: "asia" }),
      makeAnthem("zy", { region: "oceania" }),
      makeAnthem("zz", { region: "oceania" }),
    ];
    const oceania = { region: "oceania", difficulty: 4 } as const;
    expect(generateSession(pool, [], { ...oceania, rng: mulberry32(1) })).toEqual({
      ok: false,
      reason: "INSUFFICIENT_POOL",
    });
    expect(countAvailableQuestions(pool, [], oceania)).toBe(0);
    // 世界モードなら全地域が対象
    expect(countAvailableQuestions(pool, [], { region: "world", difficulty: 4 })).toBe(10);
  });

  it("上位難易度の国を自動混入しない（初級で3か国＋中級の国が多数 → 開始不可）", () => {
    const pool = [
      ...syntheticPool(3),
      ...makeIds(10)
        .slice(3)
        .map((id) => makeAnthem(id, { difficulty: 2 })),
    ];
    expect(run(pool)).toEqual({ ok: false, reason: "INSUFFICIENT_POOL" });
    expect(countAvailableQuestions(pool, [], { region: "europe", difficulty: 2 })).toBe(10);
  });

  it("maxQuestions を指定すればその数まで、10 を超える値は RangeError で拒否する", () => {
    const pool = syntheticPool(11);
    const result = run(pool, [], 1, { maxQuestions: 3 });
    expectValidSession(result, pool, [], condition);
    expect(result.totalQuestions).toBe(3);
    expect(countAvailableQuestions(pool, [], { ...condition, maxQuestions: 3 })).toBe(3);

    for (const bad of [11, 0, -1, 2.5, Number.NaN]) {
      expect(() => run(pool, [], 1, { maxQuestions: bad })).toThrow(RangeError);
      expect(() => countAvailableQuestions(pool, [], { ...condition, maxQuestions: bad })).toThrow(
        RangeError,
      );
    }
  });

  it("短い音源（2秒）でも再生区間は音源内に収まる", () => {
    for (const difficulty of DIFFICULTIES) {
      const pool = syntheticPool(4, {
        difficulty: 1,
        audio: { file: "x.mp3", durationSec: 2 },
      }).map((a) => ({ ...a, audio: { ...a.audio, file: `${a.id}.mp3` } }));
      const cond = { region: "europe", difficulty } as const;
      const result = generateSession(pool, [], { ...cond, rng: mulberry32(9) });
      expectValidSession(result, pool, [], cond);
      for (const q of result.questions) expect(q.clip.durationSec).toBe(2);
    }
  });
});

describe("generateSession：決定性", () => {
  const condition = { region: "world", difficulty: 4 } as const;

  it("同じデータ・条件・シードなら同じセッション", () => {
    const a = generateSession(anthems, melodyGroups, { ...condition, rng: mulberry32(123) });
    const b = generateSession(anthems, melodyGroups, { ...condition, rng: mulberry32(123) });
    expect(a).toEqual(b);
  });

  it("シードが違えば（通常は）異なるセッション", () => {
    const a = generateSession(anthems, melodyGroups, { ...condition, rng: mulberry32(1) });
    const b = generateSession(anthems, melodyGroups, { ...condition, rng: mulberry32(2) });
    expect(a).not.toEqual(b);
  });

  it("データの並び順や旋律グループの順序が変わっても結果は同じ", () => {
    const a = generateSession(anthems, melodyGroups, { ...condition, rng: mulberry32(77) });
    const b = generateSession([...anthems].reverse(), [...melodyGroups].reverse(), {
      ...condition,
      rng: mulberry32(77),
    });
    expect(a).toEqual(b);
  });
});
