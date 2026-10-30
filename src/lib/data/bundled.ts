/**
 * アプリに同梱する本番データの読み込み（Vite 専用）。
 * data/anthems/*.json は import.meta.glob で自動収集するので、国の一覧ファイルは不要。
 */
import melodyGroupsContent from "../../../data/melody-groups.json";
import { validateDataset, type DataFile, type ValidatedDataset } from "./validate";

const anthemModules = import.meta.glob<unknown>("../../../data/anthems/*.json", {
  eager: true,
  import: "default",
});

function toFileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function loadBundledDataset(): ValidatedDataset {
  const anthemFiles: DataFile[] = Object.entries(anthemModules).map(([path, content]) => ({
    fileName: toFileName(path),
    content,
  }));
  const result = validateDataset(
    anthemFiles,
    { fileName: "melody-groups.json", content: melodyGroupsContent },
    "production",
  );
  if (!result.ok) {
    const details = result.issues.map((i) => `${i.file}: ${i.message}`).join("\n");
    throw new Error(
      `国データの検証に失敗しました。pnpm validate:data で確認してください。\n${details}`,
    );
  }
  return result.data;
}
