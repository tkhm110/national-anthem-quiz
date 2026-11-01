import { describe, expect, it } from "vitest";
import {
  isMissingEnvironmentMessage,
  parseCodexState,
  parseSeverity,
} from "../scripts/lib/codex-comments";

// 実際の Codex のコメント（PR #14・#15）を短くしたもの
const summary = `<!-- codex-pull-request-review-summary -->
<!-- codex-review-state:v1 {"code_review":{"commit_sha":"a8d0def24f7fc78e25d559d86a4cd9a22d128d5d","has_any_findings":true,"has_unresolved_findings":true,"status":"completed"},"security_review":{"commit_sha":null,"has_any_findings":null,"has_unresolved_findings":null,"status":null}} -->

## Codex Review Summary

| Review | Status | Commit | Review trigger |
| --- | --- | --- | --- |
| 📝 **Code Review** | ✅ **Completed** <relative-time datetime="2026-11-01T08:21:45Z">2026-11-01</relative-time> | \`a8d0def\` | Manual request |`;

describe("Codex のコメントの読み取り", () => {
  it("まとめのコメントから、コードレビューとセキュリティレビューの状態ときっかけを取り出す", () => {
    expect(parseCodexState(summary)).toEqual({
      codeReview: {
        status: "completed",
        commitSha: "a8d0def24f7fc78e25d559d86a4cd9a22d128d5d",
        hasAnyFindings: true,
        hasUnresolvedFindings: true,
      },
      securityReview: {
        status: null,
        commitSha: null,
        hasAnyFindings: null,
        hasUnresolvedFindings: null,
      },
      trigger: "Manual request",
    });
  });

  it("状態の記録がない・壊れているコメントでは null", () => {
    expect(parseCodexState("Codex Review: Didn't find any major issues.")).toBeNull();
    expect(parseCodexState("<!-- codex-review-state:v1 {broken} -->")).toBeNull();
  });

  it("環境がないためにレビューできなかったことを示すコメントを見分ける", () => {
    expect(
      isMissingEnvironmentMessage(
        "To use Codex here, [create an environment for this repo](https://chatgpt.com/codex/cloud/settings/environments).",
      ),
    ).toBe(true);
    expect(isMissingEnvironmentMessage("Codex Review: Didn't find any major issues.")).toBe(false);
  });

  it("インラインの指摘から重大度を取り出す", () => {
    expect(
      parseSeverity(
        "**<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat)</sub></sub>  中国の…**",
      ),
    ).toBe("P1");
    expect(parseSeverity("重大度の表示がない指摘")).toBeNull();
  });
});
