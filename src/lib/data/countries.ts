/**
 * 超級の入力候補に使う国名の一覧（data/countries.json）の検証。
 * 読み込み方法には依存せず、アプリと検証スクリプトの両方から使う。
 */
import { searchKeys } from "../countries";
import { CountriesFileSchema, type Anthem, type Country } from "../schema";
import { JsonSyntaxError, type DataFile, type ValidationIssue } from "./validate";

export type CountriesValidationResult =
  { ok: true; countries: Country[] } | { ok: false; issues: ValidationIssue[] };

/**
 * - 形式（スキーマ）
 * - 国IDの重複
 * - 国名・英語名・別名が、別の国の名前と（表記の揺れを除いて）同じになっていないか（候補で区別できなくなるため）
 * - 収録している国がすべて一覧にあり、日本語の国名が国データと同じか（答えの表示がずれないように）
 */
export function validateCountries(
  file: DataFile,
  anthems: readonly Anthem[],
): CountriesValidationResult {
  const issue = (message: string): ValidationIssue => ({ file: file.fileName, message });

  if (file.content instanceof JsonSyntaxError) {
    return { ok: false, issues: [issue(`JSONの構文エラー: ${file.content.detail}`)] };
  }
  const parsed = CountriesFileSchema.safeParse(file.content);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) =>
        issue(`${i.path.length > 0 ? i.path.join(".") : "(root)"}: ${i.message}`),
      ),
    };
  }

  const countries = parsed.data;
  const issues: ValidationIssue[] = [];
  const byId = new Map<string, Country>();
  for (const country of countries) {
    if (byId.has(country.id)) issues.push(issue(`国ID "${country.id}" が重複しています`));
    byId.set(country.id, country);
  }

  const ownerOfKey = new Map<string, string>();
  for (const country of countries) {
    for (const key of new Set(searchKeys(country))) {
      const owner = ownerOfKey.get(key);
      if (owner !== undefined && owner !== country.id) {
        issues.push(
          issue(`名前 "${key}" が国 "${owner}" と "${country.id}" の両方にあり、区別できません`),
        );
      } else {
        ownerOfKey.set(key, country.id);
      }
    }
  }

  for (const anthem of anthems) {
    const country = byId.get(anthem.id);
    if (!country) {
      issues.push(issue(`収録している国 "${anthem.id}"（${anthem.nameJa}）が一覧にありません`));
    } else if (country.nameJa !== anthem.nameJa) {
      issues.push(
        issue(
          `国 "${anthem.id}" の日本語名が国データ（${anthem.nameJa}）と違います（${country.nameJa}）`,
        ),
      );
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, countries };
}
