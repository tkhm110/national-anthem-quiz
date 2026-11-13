/**
 * マージ後の後片付けで、手元のどのブランチを削除してよいかを決める（純粋関数）。
 * 「GitHub でマージされた PR の先頭のコミット」と「手元のブランチの先頭のコミット」が一致するときだけ削除する。
 * こうすると、push していないコミットや、PR に入っていない作業を誤って消すことがない。
 */
export type LocalBranch = { name: string; sha: string };
export type MergedPull = { number: number; headRef: string; headSha: string };
export type BranchDecision = {
  name: string;
  action: "delete" | "keep";
  reason: string;
};

export function decideBranches(
  branches: readonly LocalBranch[],
  mergedPulls: readonly MergedPull[],
  mainBranch = "main",
): BranchDecision[] {
  return branches
    .filter((b) => b.name !== mainBranch)
    .map((branch): BranchDecision => {
      // ブランチ名が違っても、内容（コミット）が同じなら同じものとして扱う
      const sameCommit = mergedPulls.find((p) => p.headSha === branch.sha);
      if (sameCommit) {
        return {
          name: branch.name,
          action: "delete",
          reason: `PR #${sameCommit.number} でマージ済み`,
        };
      }
      const sameName = mergedPulls.find((p) => p.headRef === branch.name);
      if (sameName) {
        return {
          name: branch.name,
          action: "keep",
          reason: `PR #${sameName.number} はマージ済みだが、手元の内容が PR と違う（push していないコミットがある可能性）`,
        };
      }
      return {
        name: branch.name,
        action: "keep",
        reason: "マージされた PR が見つからない（作業中）",
      };
    });
}
