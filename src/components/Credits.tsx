import type { Anthem, License } from "../lib/schema";

const LICENSE_LABELS: Record<License["type"], string> = {
  "public-domain": "パブリックドメイン",
  cc0: "CC0",
  "cc-by": "CC BY",
  "cc-by-sa": "CC BY-SA",
};

/** 音源の出典・ライセンス一覧。国データから自動で作る。 */
export function Credits({ anthems }: { anthems: readonly Anthem[] }) {
  const sorted = [...anthems].sort((a, b) => a.nameJa.localeCompare(b.nameJa, "ja"));
  return (
    <details className="credits">
      <summary>音源の出典とライセンス（{anthems.length}件）</summary>
      {sorted.length === 0 ? (
        <p>収録している音源はまだありません。</p>
      ) : (
        <ul>
          {sorted.map((a) => (
            <li key={a.id}>
              <strong>{a.nameJa}</strong>「{a.anthemTitle.original}」— 演奏：{a.license.author}（
              {LICENSE_LABELS[a.license.type]}）
              <a href={a.license.sourceUrl} target="_blank" rel="noreferrer">
                出典
              </a>
              {a.license.note && <span className="hint">（{a.license.note}）</span>}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
