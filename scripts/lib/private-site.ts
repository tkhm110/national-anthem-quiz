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

export type PrivateDeployDeps = {
  /** 音源の入っていない空のページを上げ、wrangler の出力を返す */
  deployPlaceholder: () => string;
  /** 全曲入りをビルドして上げ、wrangler の出力を返す */
  buildAndDeploy: () => string;
  /** Access の保護の問題を返す（なければ空） */
  check: (url: string) => Promise<string[]>;
  log: (message: string) => void;
};

/**
 * 非公開版を上げる手順。保存した URL ではなく、**実際の上げ先**で保護を確かめるため、
 * まず空のページを上げてその出力の URL を確かめ、保護されていれば全曲を上げる
 * （Worker の名前やアカウントが変わっても、保護されていない先に音源を上げない）。
 * 全曲を上げた後も同じ URL で保護を確かめ、違えばすぐに空のページに戻して止まる。
 * placeholderOnly なら空のページを上げるだけ（初回、Access を設定する前）。上げ先の URL を返す
 */
export async function deployPrivate(
  deps: PrivateDeployDeps,
  placeholderOnly: boolean,
): Promise<string> {
  const url = findWorkersDevUrl(deps.deployPlaceholder());
  if (!url) throw new Error("デプロイの出力から workers.dev の URL を見つけられませんでした");
  deps.log(`[OK] 空のページを上げました：${url}`);
  if (placeholderOnly) return url;

  const problems = await deps.check(url);
  if (problems.length > 0) {
    for (const p of problems) deps.log(`[ERROR] ${p}`);
    throw new Error(
      "上げ先に Cloudflare Access のログインがかかっていません。docs/development.md の手順で設定してから、もう一度実行してください（今は空のページだけが上がっています）",
    );
  }
  deps.log(`[OK] ${url} は Cloudflare Access で保護されています`);

  const deployedUrl = findWorkersDevUrl(deps.buildAndDeploy());
  const after =
    deployedUrl === url ? await deps.check(url) : [`上げ先が ${deployedUrl} に変わった`];
  if (after.length > 0) {
    for (const p of after) deps.log(`[ERROR] ${p}`);
    deps.deployPlaceholder();
    throw new Error("全曲を上げた後の確認に失敗したため、空のページに戻しました");
  }
  deps.log(`[OK] 全曲入りを上げ、${url} が保護されていることを確かめました`);
  return url;
}

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
