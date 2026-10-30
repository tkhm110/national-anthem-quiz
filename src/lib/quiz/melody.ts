import type { MelodyGroup } from "../schema";

export type MelodyRelations = {
  /** 国ID → 同一旋律クラスの代表ID。同じ値を持つ国同士は同じ4択に並べられない。 */
  identicalClassOf: (countryId: string) => string;
  /** 2か国が「類似旋律」グループを直接共有しているか（推移的には扱わない） */
  isSimilar: (a: string, b: string) => boolean;
};

/**
 * 旋律グループから、同一旋律クラス（推移閉包）と類似関係を作る。
 * identical は A=B, B=C なら A=C とみなす（Union-Find で連結成分をまとめる）。
 * similar は直接同じグループに属する組だけを類似とする。
 */
export function buildMelodyRelations(groups: readonly MelodyGroup[]): MelodyRelations {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    // 経路圧縮
    let node = id;
    while (node !== root) {
      const next = parent.get(node)!;
      parent.set(node, root);
      node = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    // 代表を辞書順で小さい方に固定し、結果を入力順に依存させない
    if (rootA < rootB) parent.set(rootB, rootA);
    else parent.set(rootA, rootB);
  };

  const similarPairs = new Set<string>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const group of groups) {
    const [first, ...rest] = group.countryIds;
    if (first === undefined) continue;
    if (group.relationType === "identical") {
      for (const other of rest) union(first, other);
    } else {
      for (const a of group.countryIds) {
        for (const b of group.countryIds) {
          if (a !== b) similarPairs.add(pairKey(a, b));
        }
      }
    }
  }

  return {
    identicalClassOf: (countryId) => find(countryId),
    isSimilar: (a, b) => a !== b && similarPairs.has(pairKey(a, b)),
  };
}
