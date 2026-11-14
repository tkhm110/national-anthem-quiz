import { describe, expect, it } from "vitest";
import { normalizeName, searchCountries } from "../src/lib/countries";
import {
  JsonSyntaxError,
  validateDataset,
  type DatasetMode,
  type DatasetValidationResult,
} from "../src/lib/data/validate";
import { isInQuizRegion, QUIZ_REGIONS } from "../src/lib/quiz";
import { loadProductionDataset, makeCountry } from "./helpers";

const production = loadProductionDataset();
const realCountries = production.countries;

function validateCountries(content: unknown, mode: DatasetMode = "fixture") {
  return validateDataset(
    {
      anthemFiles: [],
      melodyGroupsFile: { fileName: "melody-groups.json", content: [] },
      countriesFile: { fileName: "countries.json", content },
    },
    mode,
  );
}

function issueMessages(result: DatasetValidationResult): string[] {
  return result.ok ? [] : result.issues.map((i) => i.message);
}

describe("normalizeName（表記の揺れをそろえる）", () => {
  it.each([
    ["ニホン", "にほん"],
    ["ﾆﾎﾝ", "にほん"],
    ["ＵＳＡ", "usa"],
    ["Côte d'Ivoire", "cotedivoire"],
    ["ボスニア・ヘルツェゴビナ", "ぼすにあへるつぇごびな"],
    ["  United  Kingdom ", "unitedkingdom"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it("濁点・半濁点は外さない", () => {
    expect(normalizeName("ブルガリア")).not.toBe(normalizeName("フルカリア"));
  });
});

describe("searchCountries（入力候補）", () => {
  const names = (query: string, limit?: number) =>
    searchCountries(realCountries, query, limit).map((c) => c.nameJa);

  it("完全一致 → 前方一致 → 途中で一致 の順に並ぶ", () => {
    const result = names("ギニア");
    expect(result.slice(0, 2)).toEqual(["ギニア", "ギニアビサウ"]);
    expect(result.slice(2).sort()).toEqual(["パプアニューギニア", "赤道ギニア"].sort());
  });

  it("ひらがな・英語名・別名でも見つかる", () => {
    expect(names("ぎにあ")[0]).toBe("ギニア");
    expect(searchCountries(realCountries, "べいこく")[0]?.id).toBe("us");
    expect(searchCountries(realCountries, "uk")[0]?.id).toBe("gb");
    expect(searchCountries(realCountries, "Japan")[0]?.id).toBe("jp");
    expect(searchCountries(realCountries, "cote")[0]?.id).toBe("ci");
  });

  it("収録していない国も候補に出る（答えから収録国を推測できないように）", () => {
    expect(realCountries.length).toBeGreaterThan(190);
    expect(names("ツバル")).toEqual(["ツバル"]);
  });

  it("件数は limit まで。空の入力や合わない入力では候補なし", () => {
    expect(names("あ", 3)).toHaveLength(3);
    expect(names("")).toEqual([]);
    expect(names("  ")).toEqual([]);
    expect(names("存在しない国")).toEqual([]);
  });
});

describe("国の一覧（countries.json）の検証", () => {
  it("本番の一覧は、収録しているすべての国を含み、検証に通る", () => {
    const ids = new Set(realCountries.map((c) => c.id));
    expect(production.anthems.every((a) => ids.has(a.id))).toBe(true);
  });

  it("本番の一覧では、まとめたどの地域にも知名度が高い国がある", () => {
    for (const region of QUIZ_REGIONS) {
      const famous = realCountries.filter(
        (c) => c.famous && isInQuizRegion(region.value, c.region),
      );
      expect(famous.length, region.label).toBeGreaterThanOrEqual(4);
    }
  });

  it("正しい一覧は受理される", () => {
    expect(validateCountries([makeCountry("xa", { famous: true }), makeCountry("xb")]).ok).toBe(
      true,
    );
  });

  it("JSON の構文エラーを報告する", () => {
    expect(issueMessages(validateCountries(new JsonSyntaxError("x")))[0]).toContain(
      "JSONの構文エラー",
    );
  });

  it.each([
    ["地域がない", { region: undefined }],
    ["存在しない地域", { region: "antarctica" }],
    ["「全世界」は国の地域ではない", { region: "world" }],
    ["famous: false（知名度が高い国だけ true を書く）", { famous: false }],
    ["未定義の項目", { difficulty: 1 }],
  ])("形式違反を拒否する：%s", (_label, overrides) => {
    expect(validateCountries([{ ...makeCountry("xa"), ...overrides }]).ok).toBe(false);
  });

  it("国IDの重複を報告する", () => {
    const result = validateCountries([makeCountry("xa"), makeCountry("xa", { nameJa: "別の国" })]);
    expect(issueMessages(result).join("\n")).toContain(`"xa" が重複`);
  });

  it("別の国と（表記の揺れを除いて）同じ名前があると、区別できないので報告する", () => {
    const result = validateCountries([
      makeCountry("xa"),
      makeCountry("xb", { aliases: ["てすと国ＸＡ"] }),
    ]);
    expect(issueMessages(result).join("\n")).toContain("区別できません");
  });

  it("本番では、テスト用の予約IDを拒否する", () => {
    expect(issueMessages(validateCountries([makeCountry("xa")], "production")).join()).toContain(
      "予約されたID",
    );
  });
});
