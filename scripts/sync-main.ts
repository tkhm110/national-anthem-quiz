/**
 * pnpm sync [--dry-run]
 * PR をマージした後の、手元の後片付けをまとめて行う。
 *   1. main に切り替えて、GitHub の最新を取り込む
 *   2. 依存関係が変わっていたら pnpm install を実行する
 *   3. マージ済みの PR と同じ内容の手元のブランチを削除する（それ以外は残して理由を表示する）
 * 手元に保存していない変更があるときは、何もせずに止まる。GitHub 側は一切変更しない。
 */
import { execSync } from "node:child_process";
import { git, githubGet } from "./lib/github";
import { decideBranches, type LocalBranch, type MergedPull } from "./lib/sync";

const MAIN = "main";
const dryRun = process.argv.includes("--dry-run");
const note = dryRun ? "（--dry-run のため実行しない）" : "";

function fail(message: string): never {
  console.error(`[中止] ${message}`);
  process.exit(1);
}

// 0. 保存していない変更があれば止まる（ブランチの切り替えで混乱させないため）
if (git("status", "--porcelain") !== "") {
  fail(
    "コミットしていない変更があります。コミットするか取り消してから、もう一度実行してください。",
  );
}

// 1. main を最新にする
git("fetch", "--prune", "origin");
const current = git("rev-parse", "--abbrev-ref", "HEAD");
const before = git("rev-parse", MAIN);
const latest = git("rev-parse", `origin/${MAIN}`);

if (git("rev-list", "--count", `origin/${MAIN}..${MAIN}`) !== "0") {
  fail(`手元の ${MAIN} に、GitHub にないコミットがあります。内容を確認してください。`);
}
if (current !== MAIN) console.log(`${current} → ${MAIN} に切り替える${note}`);
if (before === latest) {
  console.log(`${MAIN} はすでに最新（${latest.slice(0, 7)}）`);
} else {
  console.log(`${MAIN} を更新する：${before.slice(0, 7)} → ${latest.slice(0, 7)}${note}`);
}
if (!dryRun) {
  if (current !== MAIN) git("switch", MAIN);
  if (before !== latest) git("merge", "--ff-only", `origin/${MAIN}`);
}

// 2. 依存関係が変わっていたら入れ直す
const changed = before === latest ? [] : git("diff", "--name-only", before, latest).split("\n");
if (changed.includes("pnpm-lock.yaml")) {
  console.log(`依存関係が変わったので pnpm install を実行する${note}`);
  if (!dryRun) execSync("pnpm install --frozen-lockfile", { stdio: "inherit" });
}

// 3. マージ済みのブランチを削除する
const branches: LocalBranch[] = git(
  "for-each-ref",
  "--format=%(refname:short) %(objectname)",
  "refs/heads",
)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [name, sha] = line.split(" ");
    return { name: name!, sha: sha! };
  });

type ApiPull = { number: number; merged_at: string | null; head: { ref: string; sha: string } };
let mergedPulls: MergedPull[] = [];
if (branches.some((b) => b.name !== MAIN)) {
  const pulls = await githubGet<ApiPull[]>(
    "/pulls?state=closed&per_page=100&sort=updated&direction=desc",
  );
  mergedPulls = pulls
    .filter((p) => p.merged_at !== null)
    .map((p) => ({ number: p.number, headRef: p.head.ref, headSha: p.head.sha }));
}

const decisions = decideBranches(branches, mergedPulls, MAIN);
for (const d of decisions) {
  if (d.action === "delete") {
    console.log(`ブランチ ${d.name} を削除する（${d.reason}）${note}`);
    // マージ済みの PR と同じコミットだと確認済みなので、git の判定（-d）に頼らず削除する
    if (!dryRun) git("branch", "-D", d.name);
  } else {
    console.log(`ブランチ ${d.name} は残す（${d.reason}）`);
  }
}
if (decisions.length === 0) console.log("片付けるブランチはない");

console.log(
  dryRun ? "\n確認だけ行った（何も変更していない）" : `\n完了：${MAIN} は ${latest.slice(0, 7)}`,
);
