/**
 * pnpm deploy:private [--placeholder]
 * 全曲入りの非公開版（私的利用専用）を Cloudflare Workers に上げる。CI からは使わない。
 *
 * --placeholder：音源の入っていない空のページだけを上げて Worker を作り、URL を local/private-url.txt に保存する。
 *                この後、ダッシュボードで workers.dev に Cloudflare Access をかける。
 * 引数なし     ：URL が Access のログイン画面に移ることを確かめてから、全曲入りをビルドして上げる。
 *                ログインがかかっていなければ、何も上げずに止まる。上げた後にもう一度確かめる。
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRIVATE_OUT_DIR } from "./lib/vite-local-anthems";
import { checkAccessProtected, findWorkersDevUrl } from "./lib/private-site";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const urlFile = join(rootDir, "local", "private-url.txt");
const outDir = join(rootDir, PRIVATE_OUT_DIR);
const WRANGLER = "pnpm exec wrangler deploy -c wrangler.private.jsonc";

function deploy(): string {
  const output = execSync(WRANGLER, { cwd: rootDir, encoding: "utf8", stdio: "pipe" });
  console.log(output);
  return output;
}

async function assertProtected(url: string): Promise<void> {
  const problems = await checkAccessProtected(url, fetch);
  if (problems.length > 0) {
    for (const p of problems) console.error(`[ERROR] ${p}`);
    throw new Error(
      "Cloudflare Access のログインがかかっていません。docs/development.md の手順で設定してから、もう一度実行してください",
    );
  }
  console.log(`[OK] ${url} は Cloudflare Access で保護されています`);
}

if (process.argv.includes("--placeholder")) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "index.html"),
    '<!doctype html><meta charset="utf-8"><title>準備中</title><p>準備中</p>\n',
  );
  const url = findWorkersDevUrl(deploy());
  if (!url) throw new Error("デプロイの出力から workers.dev の URL を見つけられませんでした");
  mkdirSync(join(rootDir, "local"), { recursive: true });
  writeFileSync(urlFile, `${url}\n`);
  console.log(`[OK] 空のページを上げました：${url}（local/private-url.txt に保存）`);
  console.log(
    "次に、ダッシュボードでこの Worker の workers.dev に Cloudflare Access をかけてください",
  );
} else {
  if (!existsSync(urlFile)) {
    throw new Error(
      "local/private-url.txt がありません。先に pnpm deploy:private --placeholder を実行してください",
    );
  }
  const url = readFileSync(urlFile, "utf8").trim();
  await assertProtected(url);
  execSync("pnpm build:private", { cwd: rootDir, stdio: "inherit" });
  deploy();
  await assertProtected(url);
}
