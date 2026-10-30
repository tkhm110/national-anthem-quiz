/** [0, 1) の一様乱数を返す関数。Math.random と同じ形なので本番ではそのまま渡せる。 */
export type Rng = () => number;

/**
 * シード付き擬似乱数 mulberry32。
 * 同じシードからは常に同じ数列が得られるため、テストで出題結果を再現できる。
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 以上 n 未満の整数。rng が仕様外の値（1 など）を返しても範囲外にしない。 */
export function randomInt(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.max(0, Math.floor(rng() * n)));
}

/** Fisher–Yates シャッフル。元の配列は変更せず新しい配列を返す。 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
