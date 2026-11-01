import { describe, expect, it } from "vitest";
import { replaceAiReviewSection } from "../scripts/lib/pr-body";

const template = `## 目的

テスト用の変更。

## AI レビュー（REVIEW.md の「1. リスクの分け方」に従う）

| エージェント | 結果 |
| --- | --- |
| Codex（PR） |  |

## 影響・リスク・戻し方

なし。revert で戻せる。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
`;

const filled = `## AI レビュー（REVIEW.md の「1. リスクの分け方」に従う）

| エージェント | 結果 |
| --- | --- |
| Codex（PR） | ✅ 指摘なし |`;

describe("PR の本文の AI レビューの節の差し替え", () => {
  it("AI レビューの節だけを差し替え、前後は変えない", () => {
    const result = replaceAiReviewSection(template, filled);
    expect(result).toContain("| Codex（PR） | ✅ 指摘なし |");
    expect(result).not.toContain("| Codex（PR） |  |");
    // 前後の節はそのまま残る
    expect(result.startsWith("## 目的\n\nテスト用の変更。\n\n## AI レビュー")).toBe(true);
    expect(result).toContain(
      "\n## 影響・リスク・戻し方\n\nなし。revert で戻せる。\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n",
    );
  });

  it("何度差し替えても結果は同じ（2回目で節が増えたり崩れたりしない）", () => {
    const once = replaceAiReviewSection(template, filled);
    expect(replaceAiReviewSection(once, filled)).toBe(once);
  });

  it("AI レビューの節が最後にある場合も差し替えられる", () => {
    const body = "## 目的\n\nx\n\n## AI レビュー\n\n古い表\n";
    expect(replaceAiReviewSection(body, "## AI レビュー\n\n新しい表")).toBe(
      "## 目的\n\nx\n\n## AI レビュー\n\n新しい表\n",
    );
  });

  it("節がなければ末尾に追加し、本文が空なら節だけにする", () => {
    expect(replaceAiReviewSection("## 目的\n\nx\n", "## AI レビュー\n\n表")).toBe(
      "## 目的\n\nx\n\n## AI レビュー\n\n表\n",
    );
    expect(replaceAiReviewSection("", "## AI レビュー\n\n表")).toBe("## AI レビュー\n\n表\n");
  });

  it("Windows の改行（CRLF）の本文も扱える", () => {
    const body = template.replace(/\n/g, "\r\n");
    expect(replaceAiReviewSection(body, filled)).toBe(replaceAiReviewSection(template, filled));
  });

  it("見出しで始まらない内容は受け付けない（他の節を壊さないため）", () => {
    expect(() => replaceAiReviewSection(template, "| 表だけ |")).toThrow();
  });
});
