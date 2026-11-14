import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/lib/random";
import {
  DIFFICULTIES,
  DIFFICULTY_SETTINGS,
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

describe("条件フィルター（地域・難易度）", () => {
  it("初級・中級・上級は、その難易度の国だけが対象（重ならない）", () => {
    const europe = (difficulty: 1 | 2 | 3) =>
      ids(filterByCondition(anthems, { region: "europe", difficulty }));
    expect(europe(1)).toEqual(["xa", "xb", "xf", "xg"]);
    expect(europe(2)).toEqual([]);
    expect(europe(3)).toEqual(["xc", "xd", "xe", "xh"]);
  });

  it("超級は、すべての難易度の国が対象", () => {
    expect(ids(filterByCondition(anthems, { region: "europe", difficulty: 4 }))).toEqual([
      "xa",
      "xb",
      "xc",
      "xd",
      "xe",
      "xf",
      "xg",
      "xh",
    ]);
    expect(filterByCondition(anthems, { region: "world", difficulty: 4 })).toHaveLength(18);
  });

  it("世界モードは地域を問わない", () => {
    expect(ids(filterByCondition(anthems, { region: "world", difficulty: 1 }))).toEqual([
      "xa",
      "xb",
      "xf",
      "xg",
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
    ["europe", 1, 0, "4か国あるが xa=xb=xg で2クラスしかない"],
    ["europe", 2, 0, "中級の国がない"],
    ["europe", 3, 4, "ちょうど4か国・4クラス"],
    ["asia", 1, 0, "初級は1か国のみ（ほかの難易度の国では補わない）"],
    ["asia", 2, 0, "中級は2か国のみ"],
    ["africa", 1, 0, "1か国しかない（他地域へ拡張しない）"],
    ["north-america", 1, 0, "4か国あるが xp=xq で3クラスしかない"],
    ["south-america", 1, 0, "0か国"],
    ["world", 1, 10, "10か国・7クラス"],
    ["world", 2, 0, "中級は全体でも3か国"],
    ["world", 3, 5, "上級は5か国"],
    ["world", 4, 10, "超級は全18か国。上限の10問"],
    ["europe", 4, 8, "記述式は4か国を必要としない。同じ旋律の国も出題できる"],
    ["africa", 4, 2, "記述式なら2か国でも遊べる"],
  ] as const)("%s × 難易度%s → %s問（%s）", (region, difficulty, expected, _reason) => {
    expect(count(region, difficulty)).toBe(expected);
  });

  it("地域・難易度の国数と出題可能数は一致しない場合がある（同一旋律の影響）", () => {
    const condition = { region: "north-america", difficulty: 1 } as const;
    expect(filterByCondition(anthems, condition)).toHaveLength(4);
    expect(findEligibleAnswers(anthems, melodyGroups, condition)).toEqual([]);
  });
});

describe("超級（記述式）", () => {
  it("設定上、超級は記述式で、初級〜上級は4択", () => {
    expect(DIFFICULTY_SETTINGS[4]).toMatchObject({ answerFormat: "text", available: true });
    for (const d of [1, 2, 3] as const) {
      expect(DIFFICULTY_SETTINGS[d]).toMatchObject({ answerFormat: "choice", available: true });
    }
  });

  it("選択肢を作らず、同じ旋律の国を地域・難易度をまたいで正解として認める", () => {
    // xa（ヨーロッパ・初級）と xb（アジア・上級）は同一旋律。アジアに絞っても、正解の判定には全体の同一旋律を使う
    const pool = [
      makeAnthem("xa", { region: "europe", difficulty: 1 }),
      makeAnthem("xb", { region: "asia", difficulty: 3 }),
      makeAnthem("xc", { region: "asia", difficulty: 2 }),
    ];
    const groups = [identical("xa", "xb")];
    const condition = { region: "asia", difficulty: 4 } as const;
    for (const seed of SEEDS) {
      const result = generateSession(pool, groups, { ...condition, rng: mulberry32(seed) });
      expectValidSession(result, pool, groups, condition);
      expect(result.totalQuestions).toBe(2);
      const xb = result.questions.find((q) => q.answerId === "xb");
      expect(xb?.acceptedIds).toEqual(["xa", "xb"]);
      const xc = result.questions.find((q) => q.answerId === "xc");
      expect(xc?.acceptedIds).toEqual(["xc"]);
    }
  });

  it("1か国だけでも出題できる", () => {
    const pool = syntheticPool(1);
    const condition = { region: "world", difficulty: 4 } as const;
    expect(countAvailableQuestions(pool, [], condition)).toBe(1);
  });

  it("準備中（available: false）のモードは開始できない（MODE_UNAVAILABLE）", () => {
    const pool = syntheticPool(10);
    const condition = { region: "world", difficulty: 4 } as const;
    DIFFICULTY_SETTINGS[4].available = false;
    try {
      expect(countAvailableQuestions(pool, [], condition)).toBe(0);
      expect(generateSession(pool, [], { ...condition, rng: mulberry32(1) })).toEqual({
        ok: false,
        reason: "MODE_UNAVAILABLE",
      });
    } finally {
      DIFFICULTY_SETTINGS[4].available = true;
    }
  });
});

describe("generateSession：全28モード × 複数シード", () => {
  for (const region of QUIZ_REGIONS) {
    for (const difficulty of DIFFICULTIES) {
      const condition: QuizCondition = { region: region.value, difficulty };
      it(`${region.label} × 難易度${difficulty}`, () => {
        const expected = countAvailableQuestions(anthems, melodyGroups, condition);
        const unavailableReason = DIFFICULTY_SETTINGS[difficulty].available
          ? "INSUFFICIENT_POOL"
          : "MODE_UNAVAILABLE";
        for (const seed of SEEDS) {
          const result = generateSession(anthems, melodyGroups, {
            ...condition,
            rng: mulberry32(seed),
          });
          if (expected === 0) {
            expect(result).toEqual({ ok: false, reason: unavailableReason });
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
  const condition = { region: "world", difficulty: 1 } as const;

  it("同一旋律の国（xa, xb, xg）は同じ4択に2件以上並ばない", () => {
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
    const result = generateSession(anthems, melodyGroups, { ...condition, rng: mulberry32(1) });
    expectValidSession(result, anthems, melodyGroups, condition);
    expect(result.questions.map((q) => q.answerId)).toEqual(
      expect.arrayContaining(["xa", "xb", "xg"]),
    );
  });

  it("正解は1件、選択肢の並び順も乱数で変わる（正解の位置が固定されない）", () => {
    const positions = new Set<number>();
    for (const seed of SEEDS) {
      const result = generateSession(anthems, melodyGroups, {
        ...condition,
        rng: mulberry32(seed),
      });
      if (!result.ok) throw new Error("unexpected");
      for (const q of result.questions) positions.add(q.choiceIds.indexOf(q.answerId));
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe("generateSession：上級の類似旋律優先", () => {
  const condition = { region: "world", difficulty: 3 } as const;

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

  it("初級・中級では類似旋律を優先しない（類似の国が誤答に入らない問題もある）", () => {
    const pool = syntheticPool(6, { difficulty: 1 });
    const groups = [similar("aa", "ab")];
    const cond = { region: "europe", difficulty: 1 } as const;
    const withoutPartner = SEEDS.some((seed) => {
      const result = generateSession(pool, groups, { ...cond, rng: mulberry32(seed) });
      if (!result.ok) throw new Error("unexpected");
      const q = result.questions.find((x) => x.answerId === "aa")!;
      return !q.choiceIds.includes("ab");
    });
    expect(withoutPartner).toBe(true);
  });

  it("類似候補どうしが同一旋律なら、同一旋律の除外を優先して1件だけ入れる", () => {
    const pool = syntheticPool(6, { difficulty: 3 }); // aa..af
    const groups = [similar("aa", "ab", "ac"), identical("ab", "ac")];
    const cond = { region: "europe", difficulty: 3 } as const;
    for (const seed of SEEDS) {
      const result = generateSession(pool, groups, { ...cond, rng: mulberry32(seed) });
      expectValidSession(result, pool, groups, cond);
      const q = result.questions.find((x) => x.answerId === "aa")!;
      expect(q.choiceIds.filter((id) => id === "ab" || id === "ac")).toHaveLength(1);
    }
  });

  it("類似候補が足りなければ同じ条件内の国で補充する", () => {
    const pool = syntheticPool(5, { difficulty: 3 });
    const groups = [similar("aa", "ab")];
    const cond = { region: "europe", difficulty: 3 } as const;
    const result = generateSession(pool, groups, { ...cond, rng: mulberry32(3) });
    expectValidSession(result, pool, groups, cond);
    const q = result.questions.find((x) => x.answerId === "aa")!;
    expect(q.choiceIds).toContain("ab");
  });

  it("類似候補が条件外（別の地域・別の難易度）なら誤答に入れない", () => {
    const pool = [
      ...syntheticPool(4, { difficulty: 3 }),
      makeAnthem("zy", { region: "asia", difficulty: 3 }),
      makeAnthem("zz", { region: "europe", difficulty: 1 }),
    ];
    const groups = [similar("aa", "zy", "zz")];
    const cond = { region: "europe", difficulty: 3 } as const;
    const result = generateSession(pool, groups, { ...cond, rng: mulberry32(3) });
    expectValidSession(result, pool, groups, cond);
    const all = result.questions.flatMap((q) => q.choiceIds);
    expect(all).not.toContain("zy");
    expect(all).not.toContain("zz");
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
    const oceania = { region: "oceania", difficulty: 1 } as const;
    expect(generateSession(pool, [], { ...oceania, rng: mulberry32(1) })).toEqual({
      ok: false,
      reason: "INSUFFICIENT_POOL",
    });
    expect(countAvailableQuestions(pool, [], oceania)).toBe(0);
    // 世界モードなら全地域が対象
    expect(countAvailableQuestions(pool, [], { region: "world", difficulty: 1 })).toBe(10);
  });

  it("ほかの難易度の国は混ぜない（初級3か国＋中級7か国 → 初級は開始不可、中級は7問）", () => {
    const pool = [
      ...syntheticPool(3),
      ...makeIds(10)
        .slice(3)
        .map((id) => makeAnthem(id, { difficulty: 2 })),
    ];
    expect(run(pool)).toEqual({ ok: false, reason: "INSUFFICIENT_POOL" });
    const middle = { region: "europe", difficulty: 2 } as const;
    expect(countAvailableQuestions(pool, [], middle)).toBe(7);
    const result = generateSession(pool, [], { ...middle, rng: mulberry32(1) });
    expectValidSession(result, pool, [], middle);
    for (const q of result.questions) {
      for (const id of q.choiceIds) expect(pool.find((a) => a.id === id)?.difficulty).toBe(2);
    }
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
    for (const difficulty of [1, 2, 3] as const) {
      const pool = syntheticPool(4, {
        difficulty,
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
  const condition = { region: "world", difficulty: 1 } as const;

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
