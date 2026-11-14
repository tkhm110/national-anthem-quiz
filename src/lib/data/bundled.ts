/**
 * アプリに同梱する本番データの読み込み（Vite 専用）。
 * data/anthems/*.json は import.meta.glob で自動収集するので、国の一覧ファイルは不要。
 */
import countriesContent from "../../../data/countries.json";
import melodyGroupsContent from "../../../data/melody-groups.json";
import type { Country } from "../schema";
import { validateCountries } from "./countries";
import { validateDataset, type DataFile, type ValidatedDataset } from "./validate";

const anthemModules = import.meta.glob<unknown>("../../../data/anthems/*.json", {
  eager: true,
  import: "default",
});

function toFileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function fail(issues: readonly { file: string; message: string }[]): never {
  const details = issues.map((i) => `${i.file}: ${i.message}`).join("\n");
  throw new Error(
    `国データの検証に失敗しました。pnpm validate:data で確認してください。\n${details}`,
  );
}

export function loadBundledDataset(): ValidatedDataset & { countries: Country[] } {
  const anthemFiles: DataFile[] = Object.entries(anthemModules).map(([path, content]) => ({
    fileName: toFileName(path),
    content,
  }));
  const result = validateDataset(
    anthemFiles,
    { fileName: "melody-groups.json", content: melodyGroupsContent },
    "production",
  );
  if (!result.ok) fail(result.issues);

  const countries = validateCountries(
    { fileName: "countries.json", content: countriesContent },
    result.data.anthems,
  );
  if (!countries.ok) fail(countries.issues);

  return { ...result.data, countries: countries.countries };
}
