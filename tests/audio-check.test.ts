import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkAudioFiles, type ReadDuration } from "../scripts/lib/check-audio";
import { readDataDir } from "../scripts/lib/read-data-dir";
import { validateDataset } from "../src/lib/data/validate";
import { DATA_DIR, makeAnthem } from "./helpers";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** files に書いた名前の空ファイルを置いた一時フォルダを作る */
function audioDir(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "anthem-audio-"));
  dirs.push(dir);
  for (const name of files) writeFileSync(join(dir, name), "");
  return dir;
}

const fixed =
  (seconds: number | undefined): ReadDuration =>
  async () =>
    seconds;

describe("第3層：音源ファイルの検証", () => {
  const anthem = makeAnthem("xa", { audio: { file: "xa.mp3", durationSec: 60 } });

  it("ファイルがあり、長さが誤差0.5秒以内なら問題なし", async () => {
    const dir = audioDir(["xa.mp3"]);
    for (const seconds of [59.5, 60, 60.5]) {
      const result = await checkAudioFiles([anthem], dir, fixed(seconds));
      expect(result.issues).toEqual([]);
    }
  });

  it("ファイルがなければエラー", async () => {
    const result = await checkAudioFiles([anthem], audioDir([]), fixed(60));
    expect(result.issues).toEqual([
      { file: "xa.json", message: expect.stringMatching(/xa\.mp3 がありません/) },
    ]);
  });

  it("長さが0.5秒より大きくずれていればエラー", async () => {
    const dir = audioDir(["xa.mp3"]);
    for (const seconds of [59.4, 60.6, 10]) {
      const result = await checkAudioFiles([anthem], dir, fixed(seconds));
      expect(result.issues).toEqual([
        { file: "xa.json", message: expect.stringMatching(/実際の長さ/) },
      ]);
    }
  });

  it("長さを読み取れない・読み取りで例外が出たらエラー", async () => {
    const dir = audioDir(["xa.mp3"]);
    expect((await checkAudioFiles([anthem], dir, fixed(undefined))).issues).toHaveLength(1);
    const broken: ReadDuration = async () => {
      throw new Error("corrupt");
    };
    expect((await checkAudioFiles([anthem], dir, broken)).issues).toEqual([
      { file: "xa.json", message: expect.stringMatching(/読み取れません（corrupt）/) },
    ]);
  });

  it("どの国からも使われていない音源ファイルを報告する（エラーにはしない）", async () => {
    const dir = audioDir(["xa.mp3", "old.mp3", "notes.txt"]);
    const result = await checkAudioFiles([anthem], dir, fixed(60));
    expect(result.issues).toEqual([]);
    expect(result.unusedFiles).toEqual(["old.mp3"]);
  });

  it("本番データの音源はすべて存在し、長さが国データと一致する", async () => {
    const { anthemFiles, melodyGroupsFile } = readDataDir(
      `${DATA_DIR}anthems`,
      `${DATA_DIR}melody-groups.json`,
    );
    const dataset = validateDataset(anthemFiles, melodyGroupsFile, "production");
    if (!dataset.ok) throw new Error(JSON.stringify(dataset.issues));
    const publicAudio = join(DATA_DIR, "..", "public", "audio");
    const result = await checkAudioFiles(dataset.data.anthems, publicAudio);
    expect(result.issues).toEqual([]);
    expect(result.unusedFiles).toEqual([]);
  });
});
