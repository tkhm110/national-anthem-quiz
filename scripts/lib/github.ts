/**
 * git と GitHub API を呼ぶための共通の部品（pr:status と sync で使う）。読み取りだけを行う。
 */
import { execFileSync } from "node:child_process";

export function git(...args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** origin の URL から "owner/repo" を取り出す */
export function repoSlug(): string {
  const remote = git("remote", "get-url", "origin");
  const repo = /github\.com[/:](.+?)(?:\.git)?$/.exec(remote)?.[1];
  if (!repo) throw new Error(`GitHub のリポジトリを特定できません: ${remote}`);
  return repo;
}

/**
 * gh にログインしていれば、そのトークンで API を呼ぶ（認証なしだと1時間に60回までで、すぐ上限に達するため）。
 * ログインしていなければ認証なしで呼ぶ。
 */
function ghToken(): string | null {
  try {
    return (
      execFileSync("gh", ["auth", "token"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

let cachedToken: string | null | undefined;

/** このリポジトリの GitHub API を GET で呼ぶ（path は "/pulls/1" のような、リポジトリからの相対パス） */
export async function githubGet<T>(path: string): Promise<T> {
  if (cachedToken === undefined) cachedToken = ghToken();
  const res = await fetch(`https://api.github.com/repos/${repoSlug()}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "national-anthem-quiz-scripts",
      ...(cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {}),
    },
  });
  if (!res.ok) {
    const limited = res.headers.get("x-ratelimit-remaining") === "0";
    throw new Error(
      `GitHub API ${path}: HTTP ${res.status}${
        limited ? "（API の利用回数の上限。gh auth login でログインすると上限が上がる）" : ""
      }`,
    );
  }
  return (await res.json()) as T;
}
