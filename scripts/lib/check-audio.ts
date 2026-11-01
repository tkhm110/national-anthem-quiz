/**
 * 第3層：音源ファイルの検証（Node 専用）。
 * 国データが指す音源が public/audio/ にあり、実際の長さが durationSec と合っているかを確かめる。
 * 長さの読み取り方法は引数で受け取り、テストでは差し替えられるようにする。
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseFile } from "music-metadata";
import type { ValidationIssue } from "../../src/lib/data/validate";
import type { Anthem } from "../../src/lib/schema";

/** 音源の長さ（秒）を返す。読み取れなければ undefined */
export type ReadDuration = (path: string) => Promise<number | undefined>;

export const readDurationWithMusicMetadata: ReadDuration = async (path) => {
  const metadata = await parseFile(path, { duration: true });
  return metadata.format.duration;
};

/** 国データの durationSec と実際の長さの差として許す範囲（秒） */
export const DURATION_TOLERANCE_SEC = 0.5;

export type AudioCheckResult = {
  issues: ValidationIssue[];
  /** どの国からも参照されていない音源ファイル（エラーにはしない） */
  unusedFiles: string[];
};

export async function checkAudioFiles(
  anthems: readonly Anthem[],
  audioDir: string,
  readDuration: ReadDuration = readDurationWithMusicMetadata,
): Promise<AudioCheckResult> {
  const issues: ValidationIssue[] = [];
  for (const anthem of anthems) {
    const file = `${anthem.id}.json`;
    const path = join(audioDir, anthem.audio.file);
    if (!existsSync(path)) {
      issues.push({ file, message: `音源ファイル public/audio/${anthem.audio.file} がありません` });
      continue;
    }
    let actual: number | undefined;
    try {
      actual = await readDuration(path);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      issues.push({ file, message: `音源ファイルを読み取れません（${detail}）` });
      continue;
    }
    if (actual === undefined || !Number.isFinite(actual) || actual <= 0) {
      issues.push({ file, message: `音源ファイルの長さを読み取れません` });
      continue;
    }
    if (Math.abs(actual - anthem.audio.durationSec) > DURATION_TOLERANCE_SEC) {
      issues.push({
        file,
        message: `audio.durationSec（${anthem.audio.durationSec}秒）が実際の長さ（${actual.toFixed(2)}秒）と合いません`,
      });
    }
  }

  const referenced = new Set(anthems.map((a) => a.audio.file));
  const unusedFiles = existsSync(audioDir)
    ? readdirSync(audioDir)
        .filter((name) => /\.(mp3|ogg)$/.test(name) && !referenced.has(name))
        .sort()
    : [];
  return { issues, unusedFiles };
}
