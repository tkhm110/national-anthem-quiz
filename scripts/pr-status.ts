/**
 * pnpm pr:status [PR番号]
 * PR の状態（CI・Codex のレビュー・指摘・手元とのずれ）をまとめて表示する。読み取りだけで、何も変更しない。
 * PR番号を省略すると、今のブランチの PR を探す。公開リポジトリなので GitHub の認証は不要。
 */
import { execFileSync } from "node:child_process";
import {
  CODEX_BOT,
  isMissingEnvironmentMessage,
  parseCodexState,
  parseSeverity,
  type ReviewState,
} from "./lib/codex-comments";

type Pull = {
  number: number;
  title: string;
  state: string;
  merged_at: string | null;
  mergeable_state?: string;
  head: { ref: string; sha: string };
};
type Comment = { user: { login: string }; body: string; created_at: string };
type InlineComment = Comment & {
  path: string;
  line: number | null;
  /** コミットが更新された後も残る、指摘したときの行番号 */
  original_line: number | null;
};
type Review = { user: { login: string }; state: string; commit_id: string };
type CheckRun = { name: string; status: string; conclusion: string | null };

function git(...args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

const remote = git("remote", "get-url", "origin");
const repo = /github\.com[/:](.+?)(?:\.git)?$/.exec(remote)?.[1];
if (!repo) throw new Error(`GitHub のリポジトリを特定できません: ${remote}`);
const api = `https://api.github.com/repos/${repo}`;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${api}${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "pr-status-script" },
  });
  if (!res.ok) throw new Error(`GitHub API ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function findPull(): Promise<Pull> {
  const arg = process.argv[2];
  if (arg) return get<Pull>(`/pulls/${Number(arg)}`);
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const owner = repo!.split("/")[0];
  const pulls = await get<Pull[]>(`/pulls?state=all&head=${owner}:${branch}&per_page=1`);
  if (!pulls[0])
    throw new Error(`ブランチ ${branch} の PR が見つかりません。PR番号を指定してください`);
  return get<Pull>(`/pulls/${pulls[0].number}`);
}

const short = (sha: string | null) => (sha ? sha.slice(0, 7) : "-");
const oneLine = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

function describe(label: string, r: ReviewState, headSha: string) {
  if (!r.status) return `${label}: 未実行`;
  const findings = r.hasAnyFindings === null ? "" : r.hasAnyFindings ? "・指摘あり" : "・指摘なし";
  const unresolved = r.hasUnresolvedFindings ? "（未解決あり）" : "";
  const stale = r.commitSha && r.commitSha !== headSha ? "  ※最新のコミットではない" : "";
  return `${label}: ${r.status}${findings}${unresolved}（対象 ${short(r.commitSha)}）${stale}`;
}

const pull = await findPull();
const [comments, inline, reviews, checks] = await Promise.all([
  get<Comment[]>(`/issues/${pull.number}/comments?per_page=100`),
  get<InlineComment[]>(`/pulls/${pull.number}/comments?per_page=100`),
  get<Review[]>(`/pulls/${pull.number}/reviews?per_page=100`),
  get<{ check_runs: CheckRun[] }>(`/commits/${pull.head.sha}/check-runs`),
]);

let localSha: string | null = null;
try {
  localSha = git("rev-parse", pull.head.ref);
} catch {
  // 手元にブランチがない（削除済みなど）
}

console.log(`PR #${pull.number} ${pull.title}`);
console.log(
  `状態: ${pull.merged_at ? "マージ済み" : pull.state}  マージ可否: ${pull.mergeable_state ?? "不明"}`,
);
console.log(
  `head: ${short(pull.head.sha)}（${pull.head.ref}）  手元: ${short(localSha)}${
    localSha && localSha !== pull.head.sha
      ? "  ※手元と GitHub がずれている（push 忘れの可能性）"
      : ""
  }`,
);

console.log("\n[CI]");
if (checks.check_runs.length === 0) console.log("  まだ実行されていない");
for (const c of checks.check_runs) console.log(`  ${c.name}: ${c.conclusion ?? c.status}`);

console.log("\n[Codex]");
const codexComments = comments.filter((c) => c.user.login === CODEX_BOT);
const state = codexComments
  .map((c) => parseCodexState(c.body))
  .reverse()
  .find((s) => s !== null);
if (codexComments.some((c) => isMissingEnvironmentMessage(c.body))) {
  console.log("  ※「create an environment」と返したことがある（自動レビューが動かなかった）");
}
if (state) {
  console.log(`  ${describe("コードレビュー", state.codeReview, pull.head.sha)}`);
  console.log(`  ${describe("セキュリティレビュー", state.securityReview, pull.head.sha)}`);
  if (state.trigger) console.log(`  きっかけ: ${state.trigger}`);
} else {
  console.log("  レビューの記録なし（@codex review で依頼する）");
}
const codexReviews = reviews.filter((r) => r.user.login === CODEX_BOT);
if (codexReviews.length > 0) {
  console.log(`  レビューの投稿: ${codexReviews.map((r) => short(r.commit_id)).join(", ")}`);
}

const findings = inline.filter((c) => c.user.login === CODEX_BOT);
console.log(`\n[Codex の指摘] ${findings.length}件`);
for (const f of findings) {
  const line = f.line ?? f.original_line;
  console.log(`\n- ${parseSeverity(f.body) ?? "重大度不明"} ${f.path}:${line ?? "-"}`);
  console.log(`  ${oneLine(f.body.replace(/<[^>]+>|!\[[^\]]*\]\([^)]*\)/g, ""), 1200)}`);
}
