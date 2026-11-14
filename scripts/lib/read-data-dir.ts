/**
 * Node 用のデータ読み込み。Vite の import.meta.glob は Node では使えないため、fs で同じ形（RawDataset）に揃える。
 * 検証スクリプトとテストの両方から使う。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonText, type DataFile, type RawDataset } from "../../src/lib/data/validate";

export function readJsonFile(path: string, fileName: string): DataFile {
  return { fileName, content: parseJsonText(readFileSync(path, "utf8")) };
}

/** dataDir 直下の anthems/*.json・melody-groups.json・countries.json を読み込む */
export function readDataDir(dataDir: string): RawDataset {
  const anthemsDir = join(dataDir, "anthems");
  const anthemFiles = existsSync(anthemsDir)
    ? readdirSync(anthemsDir)
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => readJsonFile(join(anthemsDir, name), name))
    : [];
  return {
    anthemFiles,
    melodyGroupsFile: readJsonFile(join(dataDir, "melody-groups.json"), "melody-groups.json"),
    countriesFile: readJsonFile(join(dataDir, "countries.json"), "countries.json"),
  };
}
