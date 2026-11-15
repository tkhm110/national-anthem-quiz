/**
 * pnpm deploy:private [--placeholder]
 * 全曲入りの非公開版（私的利用専用）を Cloudflare Workers に上げる。CI からは使わない。
 *
 * どちらも、まず音源の入っていない空のページを上げて、実際の上げ先の URL を知る。
 * --placeholder：空のページを上げるだけ（初回。この後、ダッシュボードで workers.dev に Cloudflare Access をかける）。
 * 引数なし     ：その URL が Access のログイン画面に移ることを確かめてから、全曲入りをビルドして上げる。
 *                ログインがかかっていなければ、空のページのまま止まる。上げた後にもう一度確かめる。
 */
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRIVATE_OUT_DIR } from "./lib/vite-local-anthems";
import { checkAccessProtected, deployPrivate } from "./lib/private-site";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const outDir = join(rootDir, PRIVATE_OUT_DIR);
const WRANGLER = "pnpm exec wrangler deploy -c wrangler.private.jsonc";

function deploy(): string {
  const output = execSync(WRANGLER, { cwd: rootDir, encoding: "utf8", stdio: "pipe" });
  console.log(output);
  return output;
}

await deployPrivate(
  {
    deployPlaceholder: () => {
      rmSync(outDir, { recursive: true, force: true });
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        join(outDir, "index.html"),
        '<!doctype html><meta charset="utf-8"><title>準備中</title><p>準備中</p>\n',
      );
      return deploy();
    },
    buildAndDeploy: () => {
      execSync("pnpm build:private", { cwd: rootDir, stdio: "inherit" });
      return deploy();
    },
    check: (url) => checkAccessProtected(url, fetch),
    log: (message) => console.log(message),
  },
  process.argv.includes("--placeholder"),
);
