/**
 * pnpm validate:data
 * 本番データ（data/）に対して、第1層（スキーマ）・第2層（横断整合性。国の一覧 countries.json を含む）・
 * 第3層（音源ファイル）の検証を行う。失敗時は終了コード 1。
 */
import { fileURLToPath } from "node:url";
import {
  DIFFICULTIES,
  DIFFICULTY_SETTINGS,
  QUIZ_REGIONS,
  countAvailableQuestions,
  isInQuizRegion,
} from "../src/lib/quiz";
import { validateDataset } from "../src/lib/data/validate";
import { checkAudioFiles } from "./lib/check-audio";
import { readDataDir } from "./lib/read-data-dir";

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const audioDir = fileURLToPath(new URL("../public/audio/", import.meta.url));
const raw = readDataDir(dataDir);

console.log(
  `[INFO] 対象: data/anthems/*.json（${raw.anthemFiles.length}件）, data/melody-groups.json, data/countries.json`,
);

const result = validateDataset(raw, "production");
if (!result.ok) {
  console.error(`[ERROR] 検証に失敗しました（${result.issues.length}件）`);
  for (const issue of result.issues) console.error(`  - ${issue.file}: ${issue.message}`);
  process.exit(1);
}

const { anthems, melodyGroups, countries } = result.data;
console.log(
  `[OK] スキーマ・横断整合性の検証に成功しました（国歌 ${anthems.length}件, 旋律グループ ${melodyGroups.length}件, 国の一覧 ${countries.length}か国）`,
);

const audio = await checkAudioFiles(anthems, audioDir);
for (const name of audio.unusedFiles) {
  console.warn(`[WARN] public/audio/${name} はどの国データからも使われていません`);
}
if (audio.issues.length > 0) {
  console.error(`[ERROR] 音源ファイルの検証に失敗しました（${audio.issues.length}件）`);
  for (const issue of audio.issues) console.error(`  - ${issue.file}: ${issue.message}`);
  process.exit(1);
}
console.log(`[OK] 音源ファイルの検証に成功しました（${anthems.length}件、長さの誤差は0.5秒以内）`);

if (anthems.length === 0) {
  console.warn("[WARN] 本番の国データは0件です。出題できるモードはありません。");
  process.exit(0);
}

// 地域ごとの収録国の数（知名度が高い国／それ以外）
const countryById = new Map(countries.map((c) => [c.id, c]));
console.log("\n地域ごとの収録国（知名度が高い国 / それ以外）");
for (const region of QUIZ_REGIONS) {
  const recorded = anthems
    .map((a) => countryById.get(a.id)!)
    .filter((c) => isInQuizRegion(region.value, c.region));
  const famous = recorded.filter((c) => c.famous).length;
  console.log(`  ${region.label}：${famous} / ${recorded.length - famous}`);
}

// 各モードの出題数（0 は開始不可）
console.log("\n出題可能数（最大10問）");
console.log(
  ["地域".padEnd(10), ...DIFFICULTIES.map((d) => DIFFICULTY_SETTINGS[d].label)].join("\t"),
);
for (const region of QUIZ_REGIONS) {
  const counts = DIFFICULTIES.map((difficulty) =>
    DIFFICULTY_SETTINGS[difficulty].available
      ? String(countAvailableQuestions(result.data, { region: region.value, difficulty }))
      : "準備中",
  );
  console.log([region.label.padEnd(10), ...counts].join("\t"));
}
