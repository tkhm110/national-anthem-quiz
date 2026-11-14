/**
 * 超級の入力欄で、入力された文字から国の候補を探す（純粋関数）。
 * 国名・英語名・別名を、表記の違い（ひらがな/カタカナ、全角/半角、大文字/小文字、アクセント記号、空白や「・」、ハイフンや長音符）を
 * 無視して比べる。候補から選ばせるので、答えの表記が揺れることはない。
 */
import type { Country } from "../schema";

/** 比較用に文字列をそろえる */
export function normalizeName(text: string): string {
  return (
    text
      // 全角英数・半角カナなどをそろえる
      .normalize("NFKC")
      // アクセント記号（ô・é など）を外す。日本語の濁点は U+3099 なので外れない
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .normalize("NFC")
      .toLowerCase()
      // カタカナをひらがなに
      .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      // 空白・中黒・記号・長音符は無視する。日本語入力のままハイフンを打つと「ー」になるため、
      // 長音符もハイフンと同じく外す（入力側と国名側の両方で外れるので、一致の判定はずれない）
      .replace(/[\s・·\-‐ー'’.,()（）]/g, "")
  );
}

/** 国を探すときに比べる文字列（国名・英語名・別名） */
export function searchKeys(country: Country): string[] {
  return [country.nameJa, country.nameEn, ...country.aliases].map(normalizeName);
}

/** 入力の何文字目から一致したかで順位を付ける（0：完全一致 / 1：前方一致 / 2：途中で一致） */
function matchRank(keys: readonly string[], query: string): number | null {
  let best: number | null = null;
  for (const key of keys) {
    const rank = key === query ? 0 : key.startsWith(query) ? 1 : key.includes(query) ? 2 : null;
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

const collator = new Intl.Collator("ja");

/**
 * 入力に合う国を、近い順に最大 limit 件返す。入力が空なら候補なし。
 * 完全一致 → 前方一致 → 途中で一致 の順で、同じ順位の中は日本語の国名順。
 */
export function searchCountries(
  countries: readonly Country[],
  query: string,
  limit = 8,
): Country[] {
  const q = normalizeName(query);
  if (q === "") return [];
  return countries
    .map((country) => ({ country, rank: matchRank(searchKeys(country), q) }))
    .filter((x): x is { country: Country; rank: number } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank || collator.compare(a.country.nameJa, b.country.nameJa))
    .slice(0, limit)
    .map((x) => x.country);
}
