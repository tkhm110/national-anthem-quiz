/**
 * 全曲入りの非公開版（私的利用専用）のための Vite のプラグイン。
 * local/（git の管理外）に置いた国データと音源を、Vite の "private" モードのときだけアプリに加える。
 * それ以外のモード（公開サイトのビルド・CI・テスト）では local/ を一切読まない。
 * vite.config.ts から読み込むので、Node の標準モジュール以外には依存させない。
 */
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/** 全曲入りの非公開版を作るときの Vite のモード名 */
export const PRIVATE_MODE = "private";
export const PRIVATE_OUT_DIR = "dist-private";
export const LOCAL_ANTHEMS_DIR = "local/anthems";
export const LOCAL_AUDIO_DIR = "local/audio";
export const VIRTUAL_MODULE_ID = "virtual:local-anthems";
const RESOLVED_ID = `\0${VIRTUAL_MODULE_ID}`;

/** 音源ファイル名として受け付ける形（src/lib/schema の AudioFileNameSchema と同じ） */
const AUDIO_FILE_NAME = /^[a-z0-9][a-z0-9._-]*\.(mp3|ogg)$/;
const isAudioFileName = (name: string) => AUDIO_FILE_NAME.test(name) && !name.includes("..");

/**
 * 非公開版で同梱する国データのモジュールの中身。private モード以外は常に空（local/ を読まない）。
 * 公開版（data/anthems）に同じ国があれば、公開版を優先して local/ の方は使わない。
 * 中身の検証は、アプリが公開版と合わせて validateDataset で行う。
 */
export function localAnthemsModuleSource(mode: string, rootDir: string): string {
  if (mode !== PRIVATE_MODE) return "export default [];";
  const anthemsDir = join(rootDir, LOCAL_ANTHEMS_DIR);
  if (!existsSync(anthemsDir)) return "export default [];";
  const publicNames = new Set(readdirSync(join(rootDir, "data", "anthems")));
  const files = readdirSync(anthemsDir)
    .filter((name) => name.endsWith(".json") && !publicNames.has(name))
    .sort()
    .map((fileName) => ({
      fileName,
      content: JSON.parse(readFileSync(join(anthemsDir, fileName), "utf8")) as unknown,
    }));
  return `export default ${JSON.stringify(files)};`;
}

export function localAnthemsPlugin(mode: string, rootDir: string): Plugin {
  const enabled = mode === PRIVATE_MODE;
  const audioDir = join(rootDir, LOCAL_AUDIO_DIR);
  let outDir = "";
  return {
    name: "local-anthems",
    resolveId: (id) => (id === VIRTUAL_MODULE_ID ? RESOLVED_ID : undefined),
    load: (id) => (id === RESOLVED_ID ? localAnthemsModuleSource(mode, rootDir) : undefined),
    configResolved(config) {
      outDir = config.build.outDir;
    },
    // 手元で起動したとき：/audio/<名前> が local/audio にあれば返す（Range にも対応。iOS の Safari が使う）
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use("/audio/", (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0]!.replace(/^\//, ""));
        const path = join(audioDir, name);
        if (!isAudioFileName(name) || !existsSync(path)) return next();
        const size = statSync(path).size;
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Accept-Ranges", "bytes");
        if (!range) {
          res.setHeader("Content-Length", size);
          createReadStream(path).pipe(res);
          return;
        }
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
        res.setHeader("Content-Length", end - start + 1);
        createReadStream(path, { start, end }).pipe(res);
      });
    },
    // ビルドしたとき：local/audio を出力先の audio/ にコピーする
    writeBundle() {
      if (!enabled || !existsSync(audioDir)) return;
      const target = join(outDir, "audio");
      mkdirSync(target, { recursive: true });
      for (const name of readdirSync(audioDir)) {
        if (isAudioFileName(name)) copyFileSync(join(audioDir, name), join(target, name));
      }
    },
  };
}
