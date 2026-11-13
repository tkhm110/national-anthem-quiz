import { describe, expect, it } from "vitest";
import { decideBranches } from "../scripts/lib/sync";

const merged = [
  { number: 23, headRef: "docs/public-readme", headSha: "aaa111" },
  { number: 21, headRef: "dependabot/npm_and_yarn/eslint-major", headSha: "bbb222" },
];

describe("マージ後に削除してよいブランチの判定", () => {
  it("マージされた PR と同じコミットのブランチは削除する", () => {
    expect(decideBranches([{ name: "docs/public-readme", sha: "aaa111" }], merged)).toEqual([
      { name: "docs/public-readme", action: "delete", reason: "PR #23 でマージ済み" },
    ]);
  });

  it("ブランチ名が PR と違っても、コミットが同じなら削除する（手元専用の名前で作業した場合）", () => {
    const [decision] = decideBranches([{ name: "fix/eslint-10", sha: "bbb222" }], merged);
    expect(decision).toMatchObject({ action: "delete", reason: "PR #21 でマージ済み" });
  });

  it("PR はマージ済みでも、手元に PR と違うコミットがあれば残す（push 忘れを消さない）", () => {
    const [decision] = decideBranches([{ name: "docs/public-readme", sha: "ccc333" }], merged);
    expect(decision?.action).toBe("keep");
    expect(decision?.reason).toMatch(/push していないコミット/);
  });

  it("マージされた PR がないブランチ（作業中）は残す", () => {
    const [decision] = decideBranches([{ name: "feat/new-thing", sha: "ddd444" }], merged);
    expect(decision).toMatchObject({ action: "keep", reason: expect.stringMatching(/作業中/) });
  });

  it("main は対象にしない", () => {
    expect(decideBranches([{ name: "main", sha: "aaa111" }], merged)).toEqual([]);
  });
});
