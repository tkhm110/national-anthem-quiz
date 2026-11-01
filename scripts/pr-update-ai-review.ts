/**
 * pnpm pr:ai-review <PR番号> <ファイル>
 * PR の本文の「## AI レビュー」の節だけを、ファイルの内容で置き換える（GitHub CLI の gh を使う）。
 * それ以外の部分は変更しない。/pr-check の最後に Claude Code が使う。
 * gh には、このリポジトリの Pull requests の読み書きだけを許可したトークンを登録しておく。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replaceAiReviewSection } from "./lib/pr-body";

const [prArg, sectionFile] = process.argv.slice(2);
const pr = Number(prArg);
if (!Number.isInteger(pr) || pr <= 0 || !sectionFile) {
  console.error("使い方: pnpm pr:ai-review <PR番号> <AI レビューの節を書いたファイル>");
  process.exit(1);
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

const remote = run("git", ["remote", "get-url", "origin"]);
const repo = /github\.com[/:](.+?)(?:\.git)?$/.exec(remote)?.[1];
if (!repo) throw new Error(`GitHub のリポジトリを特定できません: ${remote}`);

const current = JSON.parse(run("gh", ["api", `repos/${repo}/pulls/${pr}`])) as {
  body: string | null;
  merged_at: string | null;
};
const section = readFileSync(sectionFile, "utf8");
const updated = replaceAiReviewSection(current.body ?? "", section);

if (updated === (current.body ?? "").replace(/\r\n/g, "\n")) {
  console.log(`PR #${pr}: AI レビューの節はすでに同じ内容です（変更なし）`);
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "pr-body-"));
try {
  const bodyFile = join(dir, "body.md");
  writeFileSync(bodyFile, updated);
  run("gh", ["api", "-X", "PATCH", `repos/${repo}/pulls/${pr}`, "-F", `body=@${bodyFile}`]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(
  `PR #${pr}: AI レビューの節を更新しました${current.merged_at ? "（マージ済みの PR）" : ""}`,
);
