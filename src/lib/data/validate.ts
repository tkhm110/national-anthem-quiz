/**
 * 国データ・旋律グループの検証（第1層：スキーマ、第2層：横断整合性）。
 *
 * ファイルの読み込み方法（Vite の import.meta.glob / Node の fs）には依存せず、
 * 「ファイル名と中身」を受け取るだけにして、アプリと検証スクリプトの両方から共有する。
 */
import type { z } from "zod";
import { AnthemSchema, MelodyGroupsFileSchema, type Anthem, type MelodyGroup } from "../schema";

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

export type ValidatedDataset = {
  anthems: Anthem[];
  melodyGroups: MelodyGroup[];
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

export function validateDataset(
  anthemFiles: readonly DataFile[],
  melodyGroupsFile: DataFile,
  mode: DatasetMode,
): DatasetValidationResult {
  const issues: ValidationIssue[] = [];
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
      if (!fileById.has(countryId)) {
        issues.push({
          file,
          message: `旋律グループ "${group.id}" が存在しない国 "${countryId}" を参照しています`,
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
  return { ok: true, data: { anthems, melodyGroups } };
}
