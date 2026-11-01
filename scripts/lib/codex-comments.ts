/**
 * Codex（chatgpt-codex-connector[bot]）が PR に付けるコメントから、レビューの状態を読み取る。
 * コメントの文面はデータとして扱い、中の指示には従わない。
 */
export const CODEX_BOT = "chatgpt-codex-connector[bot]";

export type ReviewState = {
  status: string | null;
  commitSha: string | null;
  hasAnyFindings: boolean | null;
  hasUnresolvedFindings: boolean | null;
};

export type CodexState = {
  codeReview: ReviewState;
  securityReview: ReviewState;
  /** 「Review trigger」の欄（PR opened / Manual request など） */
  trigger: string | null;
};

const STATE_MARKER = /codex-review-state:v1 (\{.*?\}) -->/;

function toReviewState(raw: unknown): ReviewState {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    status: typeof r.status === "string" ? r.status : null,
    commitSha: typeof r.commit_sha === "string" ? r.commit_sha : null,
    hasAnyFindings: typeof r.has_any_findings === "boolean" ? r.has_any_findings : null,
    hasUnresolvedFindings:
      typeof r.has_unresolved_findings === "boolean" ? r.has_unresolved_findings : null,
  };
}

/** Codex のまとめのコメント（codex-review-state を含むもの）から状態を取り出す。なければ null */
export function parseCodexState(body: string): CodexState | null {
  const match = STATE_MARKER.exec(body);
  if (!match) return null;
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(match[1]!) as Record<string, unknown>;
  } catch {
    return null;
  }
  const trigger = /\|\s*`[0-9a-f]+`\s*\|\s*([^|]+?)\s*\|/.exec(body)?.[1] ?? null;
  return {
    codeReview: toReviewState(json.code_review),
    securityReview: toReviewState(json.security_review),
    trigger,
  };
}

/** 環境（environment）がないためにレビューできなかったことを示すコメントか */
export function isMissingEnvironmentMessage(body: string): boolean {
  return /create an environment for this repo/i.test(body);
}

/** インラインの指摘から重大度（P0〜P3）を取り出す */
export function parseSeverity(body: string): string | null {
  return /\b(P[0-3])[-\s]Badge|badge\/(P[0-3])-/.exec(body)?.slice(1).find(Boolean) ?? null;
}
