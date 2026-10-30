/**
 * pnpm validate:data
 * 本番データ（data/）に対して、第1層（スキーマ）と第2層（横断整合性）の検証を行う。
 * 失敗時は終了コード 1。第3層（音源ファイルの実在・形式・長さ）は音源導入フェーズで追加する。
 */
import { fileURLToPath } from "node:url";
import { DIFFICULTIES, QUIZ_REGIONS, countAvailableQuestions } from "../src/lib/quiz";
import { validateDataset } from "../src/lib/data/validate";
import { readDataDir } from "./lib/read-data-dir";

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const { anthemFiles, melodyGroupsFile } = readDataDir(
  `${dataDir}anthems`,
  `${dataDir}melody-groups.json`,
);

console.log(`[INFO] 対象: data/anthems/*.json（${anthemFiles.length}件）, data/melody-groups.json`);

const result = validateDataset(anthemFiles, melodyGroupsFile, "production");
if (!result.ok) {
  console.error(`[ERROR] 検証に失敗しました（${result.issues.length}件）`);
  for (const issue of result.issues) console.error(`  - ${issue.file}: ${issue.message}`);
  process.exit(1);
}

const { anthems, melodyGroups } = result.data;
console.log(
  `[OK] スキーマ・横断整合性の検証に成功しました（国 ${anthems.length}件, 旋律グループ ${melodyGroups.length}件）`,
);
console.log("[SKIP] 第3層（音源ファイルの検証）は未実装です（音源導入フェーズで追加予定）");

if (anthems.length === 0) {
  console.warn(
    "[WARN] 本番の国データは0件です。Phase 1 では想定どおりですが、出題できるモードはありません。",
  );
  process.exit(0);
}

// 28モードそれぞれの出題数（0 は開始不可）
console.log("\n出題可能数（最大10問）");
console.log(["地域".padEnd(8), ...DIFFICULTIES.map((d) => `難易度${d}`)].join("\t"));
for (const region of QUIZ_REGIONS) {
  const counts = DIFFICULTIES.map((difficulty) =>
    countAvailableQuestions(anthems, melodyGroups, { region: region.value, difficulty }),
  );
  console.log([region.label.padEnd(8), ...counts.map(String)].join("\t"));
}
