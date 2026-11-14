/**
 * 国歌データ・旋律グループ・国の一覧の検証（第1層：スキーマ、第2層：横断整合性）。
 *
 * ファイルの読み込み方法（Vite の import.meta.glob / Node の fs）には依存せず、
 * 「ファイル名と中身」を受け取るだけにして、アプリと検証スクリプトの両方から共有する。
 */
import type { z } from "zod";
import { searchKeys } from "../countries";
import {
  AnthemSchema,
  CountriesFileSchema,
  MelodyGroupsFileSchema,
  type Anthem,
  type Country,
  type MelodyGroup,
} from "../schema";

export type DataFile = {
  /** 表示・照合用のファイル名（例: "jp.json"）。ディレクトリは含めない。 */
  fileName: string;
  /** JSON.parse 済みの中身。構文エラーの場合は parseJsonText の結果をそのまま渡す。 */
  content: unknown;
};

export type ValidationIssue = {
  file: string;
  message: string;
};

export type DatasetMode = "production" | "fixture";

/** 検証前のデータ（ファイル名と中身） */
export type RawDataset = {
  anthemFiles: readonly DataFile[];
  melodyGroupsFile: DataFile;
  countriesFile: DataFile;
};

export type ValidatedDataset = {
  anthems: Anthem[];
  melodyGroups: MelodyGroup[];
  /** 世界の国の一覧（収録していない国も含む） */
  countries: Country[];
};

export type DatasetValidationResult =
  { ok: true; data: ValidatedDataset } | { ok: false; issues: ValidationIssue[] };

/** JSON の構文エラーを表す値。DataFile.content に入れると検証時にエラーとして報告される。 */
export class JsonSyntaxError {
  constructor(readonly detail: string) {}
}

export function parseJsonText(text: string): unknown {
  try {
    // BOM 付き UTF-8 で保存されたファイルも受け付ける
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    return new JsonSyntaxError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * ISO 3166-1 でユーザー割当（どの国にも割り当てられない）とされるコード。
 * テスト fixture の架空国はこの範囲の ID を使い、本番データでは禁止して混入を防ぐ。
 * なお "xk" はコソボの事実上のコードとして広く使われているため除外している。
 */
export function isReservedFixtureId(id: string): boolean {
  if (id === "aa" || id === "zz") return true;
  if (/^q[m-z]$/.test(id)) return true;
  return /^x[a-z]$/.test(id) && id !== "xk";
}

const PLACEHOLDER_HOSTS = ["example.com", "example.org", "example.net"];

function isPlaceholderUrl(url: string): boolean {
  const host = new URL(url).hostname;
  return PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function formatZodError(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

/**
 * 国の一覧（countries.json）の検証：形式、ID の重複、本番での予約ID、
 * 別の国と（表記の揺れを除いて）同じ名前がないか（超級の候補で区別できなくなるため）
 */
function validateCountries(
  file: DataFile,
  mode: DatasetMode,
  issues: ValidationIssue[],
): Country[] {
  const issue = (message: string) => issues.push({ file: file.fileName, message });
  if (file.content instanceof JsonSyntaxError) {
    issue(`JSONの構文エラー: ${file.content.detail}`);
    return [];
  }
  const parsed = CountriesFileSchema.safeParse(file.content);
  if (!parsed.success) {
    for (const message of formatZodError(parsed.error)) issue(message);
    return [];
  }

  const countries = parsed.data;
  const ids = new Set<string>();
  const ownerOfKey = new Map<string, string>();
  for (const country of countries) {
    if (ids.has(country.id)) issue(`国ID "${country.id}" が重複しています`);
    ids.add(country.id);
    if (mode === "production" && isReservedFixtureId(country.id)) {
      issue(`国ID "${country.id}" はテスト用の架空国に予約されたIDです。本番データには使えません`);
    }
    for (const key of new Set(searchKeys(country))) {
      const owner = ownerOfKey.get(key);
      if (owner !== undefined && owner !== country.id) {
        issue(`名前 "${key}" が国 "${owner}" と "${country.id}" の両方にあり、区別できません`);
      } else {
        ownerOfKey.set(key, country.id);
      }
    }
  }
  return countries;
}

export function validateDataset(
  { anthemFiles, melodyGroupsFile, countriesFile }: RawDataset,
  mode: DatasetMode,
): DatasetValidationResult {
  const issues: ValidationIssue[] = [];
  const countries = validateCountries(countriesFile, mode, issues);
  const countryById = new Map(countries.map((c) => [c.id, c]));
  // 国の一覧そのものが壊れているときは、参照先の検査をしない（同じ原因のエラーが大量に出るため）
  const countriesUsable = countries.length > 0;
  const anthems: Anthem[] = [];

  // ---- 第1層：スキーマ検証 ----
  for (const file of anthemFiles) {
    if (file.content instanceof JsonSyntaxError) {
      issues.push({ file: file.fileName, message: `JSONの構文エラー: ${file.content.detail}` });
      continue;
    }
    const parsed = AnthemSchema.safeParse(file.content);
    if (!parsed.success) {
      for (const message of formatZodError(parsed.error)) {
        issues.push({ file: file.fileName, message });
      }
      continue;
    }
    anthems.push(parsed.data);

    // 国の JSON は "<id>.json" という名前にする
    const expectedFileName = `${parsed.data.id}.json`;
    if (file.fileName !== expectedFileName) {
      issues.push({
        file: file.fileName,
        message: `ファイル名は "${expectedFileName}" にしてください（id: "${parsed.data.id}"）`,
      });
    }
  }

  let melodyGroups: MelodyGroup[] = [];
  if (melodyGroupsFile.content instanceof JsonSyntaxError) {
    issues.push({
      file: melodyGroupsFile.fileName,
      message: `JSONの構文エラー: ${melodyGroupsFile.content.detail}`,
    });
  } else {
    const parsed = MelodyGroupsFileSchema.safeParse(melodyGroupsFile.content);
    if (parsed.success) {
      melodyGroups = parsed.data;
    } else {
      for (const message of formatZodError(parsed.error)) {
        issues.push({ file: melodyGroupsFile.fileName, message });
      }
    }
  }

  // ---- 第2層：横断整合性検証 ----
  const fileById = new Map<string, string>();
  const idByAudioFile = new Map<string, string>();
  anthemFiles.forEach((file) => {
    const content = file.content as Partial<Anthem> | null;
    if (content && typeof content === "object" && typeof content.id === "string") {
      // スキーマ違反のファイルも重複検出の対象にする（同じ ID が別ファイルにある等）
      const previous = fileById.get(content.id);
      if (previous !== undefined) {
        issues.push({
          file: file.fileName,
          message: `国ID "${content.id}" が ${previous} と重複しています`,
        });
      } else {
        fileById.set(content.id, file.fileName);
      }
    }
  });

  for (const anthem of anthems) {
    const fileName = fileById.get(anthem.id) ?? `${anthem.id}.json`;
    // 地域と知名度は国の一覧で管理する。国歌データの国名は一覧と同じにする（答えの表示がずれないように）
    const country = countryById.get(anthem.id);
    if (countriesUsable && !country) {
      issues.push({
        file: fileName,
        message: `国 "${anthem.id}" が国の一覧（${countriesFile.fileName}）にありません`,
      });
    } else if (country && (country.nameJa !== anthem.nameJa || country.nameEn !== anthem.nameEn)) {
      issues.push({
        file: fileName,
        message: `国名が国の一覧と違います（一覧：${country.nameJa} / ${country.nameEn}）`,
      });
    }

    const otherId = idByAudioFile.get(anthem.audio.file);
    if (otherId !== undefined && otherId !== anthem.id) {
      issues.push({
        file: fileName,
        message: `音源ファイル "${anthem.audio.file}" が国 "${otherId}" と重複しています`,
      });
    } else {
      idByAudioFile.set(anthem.audio.file, anthem.id);
    }

    if (mode === "production") {
      if (isReservedFixtureId(anthem.id)) {
        issues.push({
          file: fileName,
          message: `国ID "${anthem.id}" はテスト用の架空国に予約されたIDです。本番データには使えません`,
        });
      }
      if (isPlaceholderUrl(anthem.license.sourceUrl)) {
        issues.push({
          file: fileName,
          message: `license.sourceUrl がダミーのURL（${anthem.license.sourceUrl}）です。実際の出典を記載してください`,
        });
      }
    }
  }

  const groupIds = new Set<string>();
  for (const group of melodyGroups) {
    const file = melodyGroupsFile.fileName;
    if (groupIds.has(group.id)) {
      issues.push({ file, message: `旋律グループID "${group.id}" が重複しています` });
    }
    groupIds.add(group.id);

    const members = new Set<string>();
    for (const countryId of group.countryIds) {
      if (members.has(countryId)) {
        issues.push({
          file,
          message: `旋律グループ "${group.id}" に国 "${countryId}" が重複して含まれています`,
        });
      }
      members.add(countryId);
      // 収録していない国も参照できる（誤答や超級の答えに使うため）
      if (countriesUsable && !countryById.has(countryId)) {
        issues.push({
          file,
          message: `旋律グループ "${group.id}" が国の一覧にない国 "${countryId}" を参照しています`,
        });
      }
    }
    if (members.size < 2) {
      issues.push({
        file,
        message: `旋律グループ "${group.id}" には異なる国が2件以上必要です`,
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, data: { anthems, melodyGroups, countries } };
}
