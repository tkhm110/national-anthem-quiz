/**
 * 全曲入りの非公開版のデプロイで使う、判定だけの部品（テストしやすいように fetch は引数で受け取る）。
 */

/** wrangler deploy の出力から workers.dev の URL を取り出す */
export function findWorkersDevUrl(output: string): string | undefined {
  return /https:\/\/[a-z0-9.-]+\.workers\.dev/i.exec(output)?.[0];
}

/** リダイレクト先が Cloudflare Access のログイン画面（<チーム名>.cloudflareaccess.com）か */
export function isAccessLoginRedirect(status: number, location: string | null): boolean {
  if (status < 300 || status >= 400 || !location) return false;
  try {
    return new URL(location).hostname.endsWith(".cloudflareaccess.com");
  } catch {
    return false;
  }
}

type Fetch = (url: string, init: { redirect: "manual" }) => Promise<Response>;

/**
 * ページと音源の URL が、どちらもログイン画面に移ることを確かめる。問題があれば、その説明を返す。
 * 音源の URL は存在しないファイル名でよい（Access はファイルの有無より前に止める）。
 */
export async function checkAccessProtected(baseUrl: string, fetchFn: Fetch): Promise<string[]> {
  const problems: string[] = [];
  for (const path of ["/", "/audio/access-check.mp3"]) {
    const target = new URL(path, baseUrl).toString();
    const res = await fetchFn(target, { redirect: "manual" });
    if (!isAccessLoginRedirect(res.status, res.headers.get("location"))) {
      problems.push(`${target} がログイン画面に移りません（ステータス ${res.status}）`);
    }
  }
  return problems;
}
