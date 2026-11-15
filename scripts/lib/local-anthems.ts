/**
 * 全曲入りの非公開版（私的利用専用）で、Commons のファイルから国データを作るための部品（pnpm fetch:local）。
 * Vite のプラグインは vite-local-anthems.ts にある。
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Country } from "../../src/lib/schema";
import type { DataFile } from "../../src/lib/data/validate";
import { readJsonFile } from "./read-data-dir";

export { LOCAL_ANTHEMS_DIR, LOCAL_AUDIO_DIR } from "./vite-local-anthems";

export function readLocalAnthemFiles(anthemsDir: string): DataFile[] {
  if (!existsSync(anthemsDir)) return [];
  return readdirSync(anthemsDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => readJsonFile(join(anthemsDir, name), name));
}

/** 比較用に、アクセント・記号を除いた小文字の単語列にする（"Côte d'Ivoire" → "cote d ivoire"） */
function words(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

const CATEGORY_PATTERNS = [
  /^(?:audio files of )?national anthems? of (.+)$/i,
  /^(?:audio files|symbols) of (.+)$/i,
  /^(.+)$/,
];

/** 旧国歌（「Former national anthem of …」や「(1978–2024)」のような期間付き）は使わない */
export function isFormerAnthem(fileTitle: string, categories: readonly string[]): boolean {
  return [fileTitle, ...categories].some(
    (text) => /\bformer\b/i.test(text) || /\b1[89]\d\d\s*[-–]\s*(?:1[89]|20)\d\d\b/.test(text),
  );
}

/**
 * Commons のファイルのカテゴリ（「National anthem of Kenya」「Mauritius」など）から国を決める。
 * カテゴリで決まらなければ、ファイル名に国名が単語として含まれるもの（最も長い名前）を使う。
 */
export function matchCountry(
  categories: readonly string[],
  fileTitle: string,
  countries: readonly Country[],
): Country | undefined {
  const byName = new Map<string, Country>();
  for (const country of countries) {
    for (const name of [country.nameEn, ...country.aliases]) {
      const key = words(name);
      if (/^[a-z0-9 ]{3,}$/.test(key) && !byName.has(key)) byName.set(key, country);
    }
  }
  for (const category of categories) {
    for (const pattern of CATEGORY_PATTERNS) {
      const name = pattern.exec(category)?.[1];
      const country = name ? byName.get(words(name)) : undefined;
      if (country) return country;
    }
  }
  const title = ` ${words(fileTitle.replace(/^File:/, ""))} `;
  let best: [string, Country] | undefined;
  for (const entry of byName) {
    if (title.includes(` ${entry[0]} `) && (!best || entry[0].length > best[0].length)) {
      best = entry;
    }
  }
  return best?.[1];
}
