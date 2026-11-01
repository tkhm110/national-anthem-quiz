/**
 * PR の本文のうち「## AI レビュー」の節だけを差し替える。それ以外の部分は1文字も変えない。
 */
export const AI_REVIEW_HEADING = "## AI レビュー";

/**
 * 本文の AI レビューの節（見出しの行から、次の「## 」の見出しの直前まで）を section に置き換える。
 * 節がなければ本文の末尾に追加する。section は見出しの行から始まっていなければならない。
 */
export function replaceAiReviewSection(body: string, section: string): string {
  if (!section.startsWith(AI_REVIEW_HEADING)) {
    throw new Error(`差し替える内容は「${AI_REVIEW_HEADING}」の見出しから始めてください`);
  }
  const normalized = body.replace(/\r\n/g, "\n");
  const newSection = `${section.trimEnd()}\n`;
  const lines = normalized.split("\n");
  const start = lines.findIndex((line) => line.startsWith(AI_REVIEW_HEADING));
  if (start === -1) {
    const base = normalized.trimEnd();
    return base === "" ? newSection : `${base}\n\n${newSection}`;
  }
  const nextHeading = lines.findIndex((line, i) => i > start && /^## /.test(line));
  const before = lines.slice(0, start).join("\n");
  const after = nextHeading === -1 ? "" : lines.slice(nextHeading).join("\n");
  return `${before}${before ? "\n" : ""}${newSection}${after ? `\n${after}` : ""}`;
}
