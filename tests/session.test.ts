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
  type QuizData,
} from "../src/lib/quiz";
import type { MelodyGroup } from "../src/lib/schema";
import {
  expectValidSession,
  loadFixtureDataset,
  makeAnthem,
  makeCountry,
  makeData,
  makeIds,
  type CountrySpec,
} from "./helpers";

/**
 * fixture の構成（tests/fixtures/countries.json・melody-groups.json）
 * - ヨーロッパ：収録 xa* xb* xc xd xe xf* xg* xh、未収録 qm* qn qt（* は知名度が高い国）
 *   同一旋律 xa=xb=xg、xf=qn（未収録）。類似 xc-xh, xh-xd。旋律クラスは8つ
 * - アジア・オセアニア：収録 xi* xj xl xm（アジア）、未収録 qo* qp（オセアニア）。6クラス
 * - アメリカ：収録 xp* xq* xr* xs（北アメリカ）、未収録 qq qr（南アメリカ）。同一旋律 xp=xq。5クラス
 * - アフリカ：収録 xn* xo、未収録 qs。3クラス
 */
const fixture = loadFixtureDataset();
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

const ids = (list: readonly { id: string }[]) => list.map((a) => a.id);

/** n か国（"aa", "ab", ...）を同じ指定で作る */
function uniform(n: number, spec: CountrySpec = {}): Record<string, CountrySpec> {
  return Object.fromEntries(makeIds(n).map((id) => [id, spec]));
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

function sessions(data: QuizData, condition: QuizCondition) {
  return SEEDS.map((seed) => {
    const result = generateSession(data, { ...condition, rng: mulberry32(seed) });
    expectValidSession(result, data, condition);
    return result;
  });
}

const famousIds = new Set(fixture.countries.filter((c) => c.famous).map((c) => c.id));

describe("正解にする国（地域・難易度）", () => {
  const europe = (difficulty: 1 | 2 | 3 | 4) =>
    ids(filterByCondition(fixture, { region: "europe", difficulty }));

  it("初級は知名度が高い国、中級はそれ以外（重ならない）。上級・超級は地域のすべての収録国", () => {
    expect(europe(1)).toEqual(["xa", "xb", "xf", "xg"]);
    expect(europe(2)).toEqual(["xc", "xd", "xe", "xh"]);
    expect(europe(3)).toEqual(["xa", "xb", "xc", "xd", "xe", "xf", "xg", "xh"]);
    expect(europe(4)).toEqual(europe(3));
  });

  it("収録していない国は正解にならない", () => {
    for (const difficulty of DIFFICULTIES) {
      const answers = ids(filterByCondition(fixture, { region: "world", difficulty }));
      expect(answers.filter((id) => id.startsWith("q"))).toEqual([]);
    }
  });

  it("全世界の初級は、各地域の初級を合わせたもの", () => {
    const world = ids(filterByCondition(fixture, { region: "world", difficulty: 1 }));
    const regions = QUIZ_REGIONS.filter((r) => r.value !== "world").flatMap((r) =>
      ids(filterByCondition(fixture, { region: r.value, difficulty: 1 })),
    );
    expect(world).toEqual([...regions].sort());
  });

  it("まとめた地域には、元の地域の国がすべて入る（アジア＋オセアニア、北＋南アメリカ）", () => {
    const data = makeData({
      aa: { region: "asia" },
      ab: { region: "oceania" },
      ac: { region: "north-america" },
      ad: { region: "south-america" },
      ae: { region: "europe" },
    });
    const all = (region: QuizCondition["region"]) =>
      ids(filterByCondition(data, { region, difficulty: 4 }));
    expect(all("asia-oceania")).toEqual(["aa", "ab"]);
    expect(all("americas")).toEqual(["ac", "ad"]);
    expect(all("europe")).toEqual(["ae"]);
    expect(all("africa")).toEqual([]);
  });

  it("入力に同じIDが2件ある・国の一覧にない国があれば例外（検証を経ないデータの誤用を防ぐ）", () => {
    const condition = { region: "world", difficulty: 1 } as const;
    const data = makeData({ xa: { famous: true } });
    expect(() =>
      filterByCondition({ ...data, anthems: [makeAnthem("xa"), makeAnthem("xa")] }, condition),
    ).toThrow(/重複/);
    expect(() =>
      filterByCondition({ ...data, countries: [makeCountry("xa"), makeCountry("xa")] }, condition),
    ).toThrow(/重複/);
    expect(() => filterByCondition({ ...data, countries: [] }, condition)).toThrow(
      /一覧にありません/,
    );
  });
});

describe("出題可能数（fixture の代表ケース）", () => {
  const count = (region: QuizCondition["region"], difficulty: 1 | 2 | 3 | 4) =>
    countAvailableQuestions(fixture, { region, difficulty });

  it.each([
    // [地域, 難易度, 期待する問題数, 理由]
    ["world", 1, 9, "知名度が高い収録国は9か国"],
    ["world", 2, 9, "それ以外の収録国は9か国"],
    ["world", 3, 10, "18か国。上限の10問"],
    ["world", 4, 10, "18か国。上限の10問"],
    ["europe", 1, 4, "同一旋律の xa=xb=xg も、それぞれ正解になれる"],
    ["europe", 2, 4, ""],
    ["europe", 3, 8, "未収録国を含めて8クラスあるので8択を作れる"],
    ["europe", 4, 8, ""],
    ["asia-oceania", 1, 1, "収録国が1か国でも、未収録国を誤答にして4択を作れる"],
    ["asia-oceania", 2, 3, ""],
    ["asia-oceania", 3, 0, "6クラスしかなく8択を作れない"],
    ["asia-oceania", 4, 4, "記述式は選択肢を作らない"],
    ["americas", 1, 3, "北アメリカと南アメリカを合わせて5クラス"],
    ["americas", 3, 0, "5クラスしかなく8択を作れない"],
    ["africa", 1, 0, "未収録国を含めても3クラスで、4択を作れない（他の地域へ広げない）"],
    ["africa", 4, 2, "記述式なら2か国でも遊べる"],
  ] as const)("%s × 難易度%s → %s問（%s）", (region, difficulty, expected, _reason) => {
    expect(count(region, difficulty)).toBe(expected);
  });

  it("地域の国が選択肢の数に足りなければ、正解にできる国があっても0問", () => {
    const condition = { region: "africa", difficulty: 1 } as const;
    expect(ids(filterByCondition(fixture, condition))).toEqual(["xn"]);
    expect(findEligibleAnswers(fixture, condition)).toEqual([]);
  });
});

describe("generateSession：全モード × 複数シード", () => {
  for (const region of QUIZ_REGIONS) {
    for (const difficulty of DIFFICULTIES) {
      const condition: QuizCondition = { region: region.value, difficulty };
      it(`${region.label} × 難易度${difficulty}`, () => {
        const expected = countAvailableQuestions(fixture, condition);
        for (const seed of SEEDS) {
          const result = generateSession(fixture, { ...condition, rng: mulberry32(seed) });
          if (expected === 0) {
            expect(result).toEqual({ ok: false, reason: "INSUFFICIENT_POOL" });
          } else {
            expectValidSession(result, fixture, condition);
            // 表示する問題数と実際に生成される問題数が一致する
            expect(result.totalQuestions).toBe(expected);
          }
        }
      });
    }
  }
});

describe("誤答の選び方", () => {
  it("選択肢の数は、初級・中級が4、上級が8", () => {
    expect([1, 2, 3].map((d) => DIFFICULTY_SETTINGS[d as 1 | 2 | 3].choiceCount)).toEqual([
      4, 4, 8,
    ]);
    const [result] = sessions(fixture, { region: "europe", difficulty: 3 });
    for (const q of result!.questions) expect(q.choiceIds).toHaveLength(8);
  });

  it("収録していない国も誤答に使う", () => {
    const all = sessions(fixture, { region: "europe", difficulty: 2 }).flatMap((r) =>
      r.questions.flatMap((q) => q.choiceIds),
    );
    expect(all).toEqual(expect.arrayContaining(["qt"]));
  });

  it("初級では、正解と同じ「知名度が高い国」を優先する（聴かずに消去法で解けないように）", () => {
    for (const result of sessions(fixture, { region: "europe", difficulty: 1 })) {
      for (const q of result.questions) {
        // ヨーロッパの知名度が高い国は、旋律クラスでいうと {xa,xb,xg}・xf・qm の3つ。4択の3つはすべてこれで埋まる
        expect(q.choiceIds.filter((id) => famousIds.has(id))).toHaveLength(3);
      }
    }
  });

  it("中級では、正解と同じ「それ以外の国」だけで選択肢がそろう", () => {
    for (const result of sessions(fixture, { region: "europe", difficulty: 2 })) {
      for (const q of result.questions) {
        expect(q.choiceIds.filter((id) => famousIds.has(id))).toEqual([]);
      }
    }
  });

  it("同じ分類の国が足りなければ、ほかの分類の国で補う", () => {
    const data = makeData({
      aa: { famous: true },
      ab: { famous: true },
      ...Object.fromEntries(["ac", "ad", "ae", "af"].map((id) => [id, { recorded: false }])),
    });
    const condition = { region: "europe", difficulty: 1 } as const;
    for (const result of sessions(data, condition)) {
      expect(result.totalQuestions).toBe(2);
      for (const q of result.questions) {
        expect(q.choiceIds).toEqual(expect.arrayContaining(["aa", "ab"]));
      }
    }
  });

  it("上級は分類を問わず、地域のすべての国から選ぶ", () => {
    // 8クラスちょうどなので、毎問すべてのクラスが並ぶ（知名度が高い国もそれ以外も入る）
    for (const result of sessions(fixture, { region: "europe", difficulty: 3 })) {
      for (const q of result.questions) {
        expect(q.choiceIds).toEqual(expect.arrayContaining(["xc", "xd", "xe", "xh", "qm", "qt"]));
      }
    }
  });

  it("同じ旋律の国（収録していない国を含む）は、同じ選択肢に並ばない", () => {
    for (const result of sessions(fixture, { region: "europe", difficulty: 3 })) {
      for (const q of result.questions) {
        expect(q.choiceIds.filter((id) => ["xa", "xb", "xg"].includes(id))).toHaveLength(1);
        expect(q.choiceIds.filter((id) => ["xf", "qn"].includes(id))).toHaveLength(1);
        if (q.answerId === "xf") expect(q.choiceIds).not.toContain("qn");
      }
    }
  });

  it("誤答はほかの地域へ広げない（全世界なら全地域が対象）", () => {
    const data = makeData({
      aa: { region: "africa", famous: true },
      ab: { region: "africa", recorded: false },
      ac: { region: "africa", recorded: false },
      ad: { region: "europe" },
      ae: { region: "europe" },
      af: { region: "europe" },
    });
    expect(countAvailableQuestions(data, { region: "africa", difficulty: 1 })).toBe(0);
    expect(countAvailableQuestions(data, { region: "world", difficulty: 1 })).toBe(1);
  });

  it("正解の位置は乱数で変わる（4択・8択とも、すべての位置に来る）", () => {
    for (const [condition, n] of [
      [{ region: "world", difficulty: 1 }, 4],
      [{ region: "europe", difficulty: 3 }, 8],
    ] as const) {
      const positions = new Set<number>();
      for (const result of sessions(fixture, condition)) {
        for (const q of result.questions) positions.add(q.choiceIds.indexOf(q.answerId));
      }
      expect(positions.size).toBe(n);
    }
  });
});

describe("上級の類似旋律優先", () => {
  const condition = { region: "europe", difficulty: 3 } as const;

  it("正解と類似グループを直接共有する国は必ず誤答に入る", () => {
    const data = makeData(uniform(16), [similar("aa", "ab")]);
    for (const result of sessions(data, condition)) {
      const q = result.questions.find((x) => x.answerId === "aa");
      if (q) expect(q.choiceIds).toContain("ab");
    }
  });

  it("初級・中級では類似旋律を優先しない（類似の国が誤答に入らない問題もある）", () => {
    const data = makeData(uniform(16, { famous: true }), [similar("aa", "ab")]);
    const withoutPartner = sessions(data, { region: "europe", difficulty: 1 }).some((result) => {
      const q = result.questions.find((x) => x.answerId === "aa");
      return q !== undefined && !q.choiceIds.includes("ab");
    });
    expect(withoutPartner).toBe(true);
  });

  it("類似候補どうしが同一旋律なら、同一旋律の除外を優先して1件だけ入れる", () => {
    const data = makeData(uniform(10), [similar("aa", "ab", "ac"), identical("ab", "ac")]);
    for (const result of sessions(data, condition)) {
      const q = result.questions.find((x) => x.answerId === "aa");
      if (q) expect(q.choiceIds.filter((id) => id === "ab" || id === "ac")).toHaveLength(1);
    }
  });

  it("類似候補が地域外なら誤答に入れない", () => {
    const data = makeData({ ...uniform(9), zy: { region: "asia" } }, [similar("aa", "zy")]);
    for (const result of sessions(data, condition)) {
      expect(result.questions.flatMap((q) => q.choiceIds)).not.toContain("zy");
    }
  });
});

describe("超級（記述式）", () => {
  it("設定上、超級は記述式", () => {
    expect(DIFFICULTY_SETTINGS[4]).toMatchObject({ answerFormat: "text", available: true });
  });

  it("同じ旋律の国を、地域や収録の有無によらず正解として認める", () => {
    // xa（アジア）と xb（ヨーロッパ・未収録）は同一旋律
    const data = makeData(
      { xa: { region: "asia" }, xb: { recorded: false }, xc: { region: "oceania" } },
      [identical("xa", "xb")],
    );
    for (const result of sessions(data, { region: "asia-oceania", difficulty: 4 })) {
      expect(result.totalQuestions).toBe(2);
      expect(result.questions.find((q) => q.answerId === "xa")?.acceptedIds).toEqual(["xa", "xb"]);
      expect(result.questions.find((q) => q.answerId === "xc")?.acceptedIds).toEqual(["xc"]);
    }
  });

  it("fixture では、xf を答えるとき同じ旋律の未収録国 qn も正解", () => {
    const result = sessions(fixture, { region: "europe", difficulty: 4 })[0]!;
    expect(result.questions.find((q) => q.answerId === "xf")?.acceptedIds).toEqual(["qn", "xf"]);
  });

  it("1か国だけでも出題できる", () => {
    expect(countAvailableQuestions(makeData(uniform(1)), { region: "world", difficulty: 4 })).toBe(
      1,
    );
  });

  it("準備中（available: false）のモードは開始できない（MODE_UNAVAILABLE）", () => {
    const data = makeData(uniform(10));
    const condition = { region: "world", difficulty: 4 } as const;
    DIFFICULTY_SETTINGS[4].available = false;
    try {
      expect(countAvailableQuestions(data, condition)).toBe(0);
      expect(generateSession(data, { ...condition, rng: mulberry32(1) })).toEqual({
        ok: false,
        reason: "MODE_UNAVAILABLE",
      });
    } finally {
      DIFFICULTY_SETTINGS[4].available = true;
    }
  });
});

describe("問題数と境界条件", () => {
  const condition = { region: "europe", difficulty: 1 } as const;
  const famous = (n: number) => uniform(n, { famous: true });
  const run = (data: QuizData, seed = 1, extra = {}) =>
    generateSession(data, { ...condition, rng: mulberry32(seed), ...extra });

  it("空データ・3か国 → INSUFFICIENT_POOL", () => {
    expect(run(makeData({}))).toEqual({ ok: false, reason: "INSUFFICIENT_POOL" });
    expect(run(makeData(famous(3)))).toEqual({ ok: false, reason: "INSUFFICIENT_POOL" });
  });

  it("収録国が1か国でも、地域に未収録の国が3か国あれば1問出せる", () => {
    const data = makeData({
      aa: { famous: true },
      ...Object.fromEntries(["ab", "ac", "ad"].map((id) => [id, { recorded: false }])),
    });
    const result = run(data);
    expectValidSession(result, data, condition);
    expect(result.totalQuestions).toBe(1);
    expect([...result.questions[0]!.choiceIds].sort()).toEqual(["aa", "ab", "ac", "ad"]);
  });

  it("ちょうど4か国 → 4問、毎問その4か国すべてが選択肢", () => {
    const data = makeData(famous(4));
    const result = run(data);
    expectValidSession(result, data, condition);
    expect(result.totalQuestions).toBe(4);
    for (const q of result.questions) expect([...q.choiceIds].sort()).toEqual(makeIds(4));
  });

  it("10か国 → 10問（全か国が1回ずつ正解）、11か国 → 10問（正解の重複なし）", () => {
    const ten = makeData(famous(10));
    const result = run(ten);
    expectValidSession(result, ten, condition);
    expect([...result.questions.map((q) => q.answerId)].sort()).toEqual(makeIds(10));

    const eleven = makeData(famous(11));
    for (const seed of SEEDS) {
      const r = run(eleven, seed);
      expectValidSession(r, eleven, condition);
      expect(r.totalQuestions).toBe(10);
    }
  });

  it("国が十分あっても同一旋律だらけなら INSUFFICIENT_POOL。ちょうど4クラスなら成立する", () => {
    const crowded = makeData(famous(8), [
      identical("aa", "ab", "ac", "ad"),
      identical("ae", "af", "ag"),
      identical("ag", "ah"),
    ]);
    expect(run(crowded)).toEqual({ ok: false, reason: "INSUFFICIENT_POOL" });

    const four = makeData(famous(7), [identical("aa", "ab", "ac"), identical("ad", "ae")]);
    for (const seed of SEEDS) {
      const r = run(four, seed);
      expectValidSession(r, four, condition);
      expect(r.totalQuestions).toBe(7);
    }
  });

  it("上級の8択には、地域に8クラス必要", () => {
    const hard = { region: "europe", difficulty: 3 } as const;
    expect(countAvailableQuestions(makeData(uniform(7)), hard)).toBe(0);
    expect(countAvailableQuestions(makeData(uniform(8)), hard)).toBe(8);
  });

  it("maxQuestions を指定すればその数まで、10 を超える値は RangeError で拒否する", () => {
    const data = makeData(famous(11));
    const result = run(data, 1, { maxQuestions: 3 });
    expectValidSession(result, data, condition);
    expect(result.totalQuestions).toBe(3);
    expect(countAvailableQuestions(data, { ...condition, maxQuestions: 3 })).toBe(3);

    for (const bad of [11, 0, -1, 2.5, Number.NaN]) {
      expect(() => run(data, 1, { maxQuestions: bad })).toThrow(RangeError);
      expect(() => countAvailableQuestions(data, { ...condition, maxQuestions: bad })).toThrow(
        RangeError,
      );
    }
  });

  it("短い音源（2秒）でも再生区間は音源内に収まる", () => {
    // 出題エンジンはファイル名を見ないので、全員同じ名前でよい
    const short = { file: "x.mp3", durationSec: 2 };
    for (const difficulty of DIFFICULTIES) {
      const data = makeData(
        uniform(8, { audio: short, ...(difficulty === 1 ? { famous: true } : {}) }),
      );
      const cond = { region: "europe", difficulty } as const;
      const result = generateSession(data, { ...cond, rng: mulberry32(9) });
      expectValidSession(result, data, cond);
      for (const q of result.questions) expect(q.clip.durationSec).toBe(2);
    }
  });
});

describe("決定性", () => {
  const condition = { region: "world", difficulty: 1 } as const;
  const run = (data: QuizData, seed: number) =>
    generateSession(data, { ...condition, rng: mulberry32(seed) });

  it("同じデータ・条件・シードなら同じセッション。シードが違えば（通常は）異なる", () => {
    expect(run(fixture, 123)).toEqual(run(fixture, 123));
    expect(run(fixture, 1)).not.toEqual(run(fixture, 2));
  });

  it("データの並び順や旋律グループの順序が変わっても結果は同じ", () => {
    const reversed: QuizData = {
      anthems: [...fixture.anthems].reverse(),
      countries: [...fixture.countries].reverse(),
      melodyGroups: [...fixture.melodyGroups].reverse(),
    };
    for (const difficulty of DIFFICULTIES) {
      const cond = { region: "world", difficulty } as const;
      expect(generateSession(reversed, { ...cond, rng: mulberry32(77) })).toEqual(
        generateSession(fixture, { ...cond, rng: mulberry32(77) }),
      );
    }
  });
});
