/**
 * Node 用のデータ読み込み。Vite の import.meta.glob は Node では使えないため、fs で同じ形（DataFile）に揃える。
 * 検証スクリプトとテストの両方から使う。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonText, type DataFile } from "../../src/lib/data/validate";

export type RawDataset = {
  anthemFiles: DataFile[];
  melodyGroupsFile: DataFile;
};

export function readJsonFile(path: string, fileName: string): DataFile {
  return { fileName, content: parseJsonText(readFileSync(path, "utf8")) };
}

/** anthemsDir 直下の *.json と、melody-groups.json を読み込む */
export function readDataDir(anthemsDir: string, melodyGroupsPath: string): RawDataset {
  const anthemFiles = existsSync(anthemsDir)
    ? readdirSync(anthemsDir)
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => readJsonFile(join(anthemsDir, name), name))
    : [];
  const melodyGroupsFile = readJsonFile(melodyGroupsPath, "melody-groups.json");
  return { anthemFiles, melodyGroupsFile };
}
