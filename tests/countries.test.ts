import { describe, expect, it } from "vitest";
import { readDataDir, readJsonFile } from "../scripts/lib/read-data-dir";
import { normalizeName, searchCountries } from "../src/lib/countries";
import { validateCountries } from "../src/lib/data/countries";
import { JsonSyntaxError, validateDataset, type DataFile } from "../src/lib/data/validate";
import type { Country } from "../src/lib/schema";
import { DATA_DIR, makeAnthem } from "./helpers";

function loadRealData() {
  const { anthemFiles, melodyGroupsFile } = readDataDir(
    `${DATA_DIR}anthems`,
    `${DATA_DIR}melody-groups.json`,
  );
  const dataset = validateDataset(anthemFiles, melodyGroupsFile, "production");
  if (!dataset.ok) throw new Error(JSON.stringify(dataset.issues, null, 2));
  const countries = validateCountries(
    readJsonFile(`${DATA_DIR}countries.json`, "countries.json"),
    dataset.data.anthems,
  );
  return { anthems: dataset.data.anthems, countries };
}

const real = loadRealData();
const realCountries = real.countries.ok ? real.countries.countries : [];

function country(id: string, nameJa: string, aliases: string[] = []): Country {
  return { id, nameJa, nameEn: `Testland ${id.toUpperCase()}`, aliases };
}

function countriesFile(content: unknown): DataFile {
  return { fileName: "countries.json", content };
}

function issueMessages(result: ReturnType<typeof validateCountries>): string[] {
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

describe("validateCountries（data/countries.json の検証）", () => {
  const anthems = [makeAnthem("xa", { nameJa: "テスト国XA" })];

  it("本番の一覧は、収録しているすべての国を含み、検証に通る", () => {
    expect(real.anthems.length).toBeGreaterThan(0);
    expect(issueMessages(real.countries)).toEqual([]);
  });

  it("正しい一覧は受理される", () => {
    const result = validateCountries(
      countriesFile([country("xa", "テスト国XA"), country("xb", "テスト国XB")]),
      anthems,
    );
    expect(result.ok).toBe(true);
  });

  it("JSON の構文エラーを報告する", () => {
    const result = validateCountries(countriesFile(new JsonSyntaxError("x")), anthems);
    expect(issueMessages(result)[0]).toContain("JSONの構文エラー");
  });

  it("スキーマに合わない項目を報告する", () => {
    const result = validateCountries(countriesFile([{ id: "xa", nameJa: "テスト国XA" }]), anthems);
    expect(result.ok).toBe(false);
  });

  it("国IDの重複を報告する", () => {
    const result = validateCountries(
      countriesFile([country("xa", "テスト国XA"), country("xa", "別の国")]),
      anthems,
    );
    expect(issueMessages(result).join("\n")).toContain('"xa" が重複');
  });

  it("別の国と（表記の揺れを除いて）同じ名前があると、区別できないので報告する", () => {
    const result = validateCountries(
      countriesFile([country("xa", "テスト国XA"), country("xb", "テスト国XB", ["てすと国ＸＡ"])]),
      anthems,
    );
    expect(issueMessages(result).join("\n")).toContain("区別できません");
  });

  it("収録している国が一覧にない・日本語名が違うときは報告する", () => {
    const missing = validateCountries(countriesFile([country("xb", "テスト国XB")]), anthems);
    expect(issueMessages(missing).join("\n")).toContain('"xa"');

    const mismatch = validateCountries(countriesFile([country("xa", "違う名前")]), anthems);
    expect(issueMessages(mismatch).join("\n")).toContain("日本語名");
  });
});
