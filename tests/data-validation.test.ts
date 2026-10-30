import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDataDir, readJsonFile } from "../scripts/lib/read-data-dir";
import {
  isReservedFixtureId,
  JsonSyntaxError,
  parseJsonText,
  validateDataset,
  type DataFile,
  type DatasetValidationResult,
} from "../src/lib/data/validate";
import { AnthemSchema } from "../src/lib/schema";
import { DATA_DIR, FIXTURES_DIR, loadFixtureDataset, makeAnthem } from "./helpers";

const noGroups: DataFile = { fileName: "melody-groups.json", content: [] };

function anthemFile(id: string, overrides: Record<string, unknown> = {}, fileName = `${id}.json`) {
  return { fileName, content: { ...makeAnthem(id), ...overrides } };
}

function issueMessages(result: DatasetValidationResult): string[] {
  return result.ok ? [] : result.issues.map((i) => `${i.file}: ${i.message}`);
}

describe("JSONの読み込み", () => {
  it("BOM 付き UTF-8 も読める", () => {
    expect(parseJsonText(`${String.fromCharCode(0xfeff)}{"a":1}`)).toEqual({ a: 1 });
  });

  it("構文エラーは例外ではなく JsonSyntaxError として返す", () => {
    expect(parseJsonText("{")).toBeInstanceOf(JsonSyntaxError);
  });
});

describe("第1層：スキーマ検証", () => {
  it("fixture の架空国データはすべて受理される", () => {
    const { anthems, melodyGroups } = loadFixtureDataset();
    expect(anthems).toHaveLength(18);
    expect(melodyGroups).toHaveLength(5);
  });

  it("正しい国データを受理する（任意項目あり）", () => {
    const result = AnthemSchema.safeParse({
      ...makeAnthem("xa"),
      anthemTitle: { original: "Original", ja: "日本語題" },
      composer: "Someone",
      adoptedYear: 1900,
      license: {
        type: "cc-by",
        author: "A",
        sourceUrl: "https://example.com/a",
        note: "帰属表示が必要",
      },
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ["syntax-error.json", /JSONの構文エラー/],
    ["missing-license.json", /^license: /],
    ["bad-audio-path.json", /^audio\.file: /],
    ["bad-region.json", /^region: /],
  ])("不正な fixture %s を拒否する", (fileName, pattern) => {
    const file = readJsonFile(`${FIXTURES_DIR}invalid/${fileName}`, fileName);
    const result = validateDataset([file], noGroups, "fixture");
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(pattern)]),
    );
  });

  it("bad-region.json では地域・難易度・ライセンス種別・URL をすべて報告する", () => {
    const file = readJsonFile(`${FIXTURES_DIR}invalid/bad-region.json`, "bad-region.json");
    const result = validateDataset([file], noGroups, "fixture");
    const paths = result.ok ? [] : result.issues.map((i) => i.message.split(":")[0]);
    expect(paths).toEqual(
      expect.arrayContaining(["region", "difficulty", "license.type", "license.sourceUrl"]),
    );
  });

  it.each([
    ["大文字のID", { id: "XA" }],
    ["3文字のID", { id: "xab" }],
    ["空の国名", { nameJa: "" }],
    ["難易度0", { difficulty: 0 }],
    ["難易度が文字列", { difficulty: "1" }],
    ["音源の長さ0", { audio: { file: "xa.mp3", durationSec: 0 } }],
    ["音源の長さが負", { audio: { file: "xa.mp3", durationSec: -5 } }],
    ["音源にディレクトリを含む", { audio: { file: "sub/xa.mp3", durationSec: 60 } }],
    ["音源が '.' 始まり", { audio: { file: ".xa.mp3", durationSec: 60 } }],
    ["音源に '..' を含む", { audio: { file: "x..a.mp3", durationSec: 60 } }],
    ["音源の拡張子なし", { audio: { file: "xa", durationSec: 60 } }],
    ["音源が wav", { audio: { file: "xa.wav", durationSec: 60 } }],
    ["ライセンスの作者が空", { license: { type: "cc0", author: "", sourceUrl: "https://a.b/" } }],
    [
      "ライセンスURLが http(s) 以外",
      { license: { type: "cc0", author: "a", sourceUrl: "ftp://a.b/" } },
    ],
    ["制定年が小数", { adoptedYear: 1900.5 }],
    ["未定義の項目（typo 検出）", { regoin: "europe" }],
  ])("形式違反を拒否する：%s", (_label, overrides) => {
    expect(AnthemSchema.safeParse({ ...makeAnthem("xa"), ...overrides }).success).toBe(false);
  });

  it("旋律グループの形式違反（種類・メンバー1件・空の説明）を拒否する", () => {
    const groups: DataFile = {
      fileName: "melody-groups.json",
      content: [
        { id: "g1", relationType: "same", countryIds: ["xa", "xb"], description: "x" },
        { id: "g2", relationType: "identical", countryIds: ["xa"], description: "x" },
        { id: "g3", relationType: "similar", countryIds: ["xa", "xb"], description: "" },
      ],
    };
    const result = validateDataset([anthemFile("xa"), anthemFile("xb")], groups, "fixture");
    expect(issueMessages(result)).toHaveLength(3);
  });
});

describe("第2層：横断整合性検証", () => {
  it("国IDの重複を検出する", () => {
    const result = validateDataset(
      [anthemFile("xa"), anthemFile("xa", {}, "xa-copy.json")],
      noGroups,
      "fixture",
    );
    expect(issueMessages(result)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/xa-copy\.json: 国ID "xa" が xa\.json と重複/),
      ]),
    );
  });

  it("ファイル名とIDの不一致を検出する", () => {
    const result = validateDataset([anthemFile("xa", {}, "xb.json")], noGroups, "fixture");
    expect(issueMessages(result)).toEqual([
      expect.stringMatching(/xb\.json: ファイル名は "xa\.json"/),
    ]);
  });

  it("音源ファイル名の重複を検出する", () => {
    const result = validateDataset(
      [anthemFile("xa"), anthemFile("xb", { audio: { file: "xa.mp3", durationSec: 60 } })],
      noGroups,
      "fixture",
    );
    expect(issueMessages(result)).toEqual([expect.stringMatching(/音源ファイル "xa\.mp3"/)]);
  });

  it("存在しない国を参照する旋律グループを検出する", () => {
    const groups: DataFile = {
      fileName: "melody-groups.json",
      content: [{ id: "g", relationType: "identical", countryIds: ["xa", "zz"], description: "x" }],
    };
    const result = validateDataset([anthemFile("xa")], groups, "fixture");
    expect(issueMessages(result)).toEqual([expect.stringMatching(/存在しない国 "zz"/)]);
  });

  it("旋律グループ内の重複とメンバー不足（重複を除くと1か国）を検出する", () => {
    const groups: DataFile = {
      fileName: "melody-groups.json",
      content: [{ id: "g", relationType: "identical", countryIds: ["xa", "xa"], description: "x" }],
    };
    const result = validateDataset([anthemFile("xa")], groups, "fixture");
    expect(issueMessages(result)).toEqual([
      expect.stringMatching(/国 "xa" が重複して含まれています/),
      expect.stringMatching(/異なる国が2件以上必要です/),
    ]);
  });

  it("旋律グループIDの重複を検出する", () => {
    const group = { id: "g", relationType: "similar", countryIds: ["xa", "xb"], description: "x" };
    const result = validateDataset(
      [anthemFile("xa"), anthemFile("xb")],
      { fileName: "melody-groups.json", content: [group, group] },
      "fixture",
    );
    expect(issueMessages(result)).toEqual([expect.stringMatching(/旋律グループID "g" が重複/)]);
  });

  it("旋律グループファイルの構文エラーを報告する", () => {
    const result = validateDataset(
      [anthemFile("xa")],
      readJsonFile(`${FIXTURES_DIR}invalid/syntax-error.json`, "melody-groups.json"),
      "fixture",
    );
    expect(issueMessages(result)).toEqual([
      expect.stringMatching(/melody-groups\.json: JSONの構文エラー/),
    ]);
  });
});

describe("本番データとテスト fixture の分離", () => {
  it("予約ID（aa, qm〜qz, xa〜xz（xk除く）, zz）を判定する", () => {
    expect(["aa", "qm", "qz", "xa", "xz", "zz"].every(isReservedFixtureId)).toBe(true);
    expect(["jp", "gb", "xk", "ql", "ab"].some(isReservedFixtureId)).toBe(false);
  });

  it("fixture のデータは本番モードでは拒否される（予約ID・ダミーURL）", () => {
    const { anthemFiles, melodyGroupsFile } = readDataDir(
      `${FIXTURES_DIR}anthems`,
      `${FIXTURES_DIR}melody-groups.json`,
    );
    const messages = issueMessages(validateDataset(anthemFiles, melodyGroupsFile, "production"));
    expect(messages.filter((m) => m.includes("予約されたID"))).toHaveLength(anthemFiles.length);
    expect(messages.filter((m) => m.includes("ダミーのURL"))).toHaveLength(anthemFiles.length);
  });

  it("本番用の国データとして実在の国ID・実際の出典は受理される", () => {
    const content = {
      ...makeAnthem("jp"),
      license: {
        type: "public-domain",
        author: "Someone",
        sourceUrl: "https://commons.wikimedia.org/",
      },
    };
    const result = validateDataset([{ fileName: "jp.json", content }], noGroups, "production");
    expect(result.ok).toBe(true);
  });

  it("本番データ（data/）は検証に通り、fixture の国が混入していない", () => {
    const { anthemFiles, melodyGroupsFile } = readDataDir(
      `${DATA_DIR}anthems`,
      `${DATA_DIR}melody-groups.json`,
    );
    const result = validateDataset(anthemFiles, melodyGroupsFile, "production");
    expect(issueMessages(result)).toEqual([]);

    const fixtureFileNames = new Set(readdirSync(`${FIXTURES_DIR}anthems`));
    expect(anthemFiles.filter((f) => fixtureFileNames.has(f.fileName))).toEqual([]);
  });
});
