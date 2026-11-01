/**
 * 音源の URL を作る。配信元（ローカルの public/audio/ か、将来の R2 など）は baseUrl で切り替える。
 * ファイル名はスキーマで basename に制限しているが、ここでも念のため検査し、パス走査を防ぐ。
 */
const SAFE_FILE_NAME = /^[a-z0-9][a-z0-9._-]*\.(mp3|ogg)$/;

export function buildAudioUrl(fileName: string, baseUrl: string): string {
  if (!SAFE_FILE_NAME.test(fileName) || fileName.includes("..")) {
    throw new Error(`音源ファイル名が不正です: ${fileName}`);
  }
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}${encodeURIComponent(fileName)}`;
}
