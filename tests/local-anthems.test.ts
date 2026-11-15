import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canReuseAudio,
  isFormerAnthem,
  matchCountry,
  readLocalAnthemFiles,
  writeFileCreatingDir,
} from "../scripts/lib/local-anthems";
import {
  PRIVATE_MODE,
  localAnthemsModuleSource,
  localAnthemsPlugin,
  localAudioFile,
} from "../scripts/lib/vite-local-anthems";
import {
  checkAccessProtected,
  deployPrivate,
  findWorkersDevUrl,
  isAccessLoginRedirect,
} from "../scripts/lib/private-site";
import { makeCountry } from "./helpers";

/** data/anthems と local/anthems を持つ一時的なプロジェクトを作る */
function makeRoot(publicFiles: string[], localFiles: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "local-anthems-"));
  mkdirSync(join(root, "data", "anthems"), { recursive: true });
  mkdirSync(join(root, "local", "anthems"), { recursive: true });
  for (const name of publicFiles) writeFileSync(join(root, "data", "anthems", name), "{}");
  for (const name of localFiles) {
    writeFileSync(join(root, "local", "anthems", name), JSON.stringify({ id: name.slice(0, 2) }));
  }
  return root;
}

describe("localAnthemsModuleSource（全曲入りの非公開版の国データ）", () => {
  it("公開版のモードでは local/ があっても空にする", () => {
    const root = makeRoot([], ["qa.json"]);
    for (const mode of ["production", "development", "test"]) {
      expect(localAnthemsModuleSource(mode, root)).toBe("export default [];");
    }
  });

  it("公開版のモードでは local/ を読まない（フォルダがなくても失敗しない）", () => {
    expect(localAnthemsModuleSource("production", join(tmpdir(), "does-not-exist"))).toBe(
      "export default [];",
    );
  });

  it("private モードでは local/ の国を加え、公開版にある国は除く", () => {
    const root = makeRoot(["qa.json"], ["qa.json", "qb.json"]);
    const source = localAnthemsModuleSource(PRIVATE_MODE, root);
    const files = JSON.parse(source.replace(/^export default /, "").replace(/;$/, ""));
    expect(files.map((f: { fileName: string }) => f.fileName)).toEqual(["qb.json"]);
  });
});

/** public/audio と local/audio に音源（中身はどちらの音源かを表す文字列）を置いた一時的なプロジェクトを作る */
function makeAudioRoot(publicAudio: string[], localAudio: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "local-audio-"));
  mkdirSync(join(root, "public", "audio"), { recursive: true });
  mkdirSync(join(root, "local", "audio"), { recursive: true });
  for (const name of publicAudio) writeFileSync(join(root, "public", "audio", name), "public");
  for (const name of localAudio) writeFileSync(join(root, "local", "audio", name), "local");
  return root;
}

describe("非公開版の音源（公開版と同じ名前なら公開版を使う）", () => {
  it("local/audio の音源のうち、公開版にない名前のものだけを返す", () => {
    const root = makeAudioRoot(["qa.mp3"], ["qa.mp3", "qb.mp3"]);
    expect(localAudioFile(root, "qa.mp3")).toBeUndefined();
    expect(localAudioFile(root, "qb.mp3")).toBe(join(root, "local", "audio", "qb.mp3"));
    expect(localAudioFile(root, "qc.mp3")).toBeUndefined();
    expect(localAudioFile(root, "../anthems/qa.json")).toBeUndefined();
  });

  it("ビルドでは、公開版の音源を local/audio で上書きしない", () => {
    const root = makeAudioRoot(["qa.mp3"], ["qa.mp3", "qb.mp3"]);
    const outDir = join(root, "dist-private");
    // Vite が public/ をコピーした後の状態
    mkdirSync(join(outDir, "audio"), { recursive: true });
    writeFileSync(join(outDir, "audio", "qa.mp3"), "public");
    const plugin = localAnthemsPlugin(PRIVATE_MODE, root);
    (plugin.configResolved as (c: unknown) => void)({ build: { outDir } });
    (plugin.writeBundle as () => void)();
    expect(readFileSync(join(outDir, "audio", "qa.mp3"), "utf8")).toBe("public");
    expect(readFileSync(join(outDir, "audio", "qb.mp3"), "utf8")).toBe("local");
  });
});

describe("readLocalAnthemFiles・writeFileCreatingDir（pnpm fetch:local）", () => {
  it("公開版にある国を除いて読める（公開版に移した国があっても検証で重複しない）", () => {
    const root = makeRoot(["qa.json"], ["qa.json", "qb.json"]);
    const files = readLocalAnthemFiles(join(root, "local", "anthems"), new Set(["qa.json"]));
    expect(files.map((f) => f.fileName)).toEqual(["qb.json"]);
  });

  it("保存先のフォルダがまだなくても書ける（初回の実行で local/ がない場合）", () => {
    const path = join(mkdtempSync(join(tmpdir(), "write-")), "local", "wayback-index.json");
    writeFileCreatingDir(path, "[]");
    expect(readFileSync(path, "utf8")).toBe("[]");
  });
});

describe("matchCountry（Commons のファイルから国を決める）", () => {
  const countries = [
    makeCountry("ke", { nameEn: "Kenya" }),
    makeCountry("ir", { nameEn: "Iran" }),
    makeCountry("om", { nameEn: "Oman" }),
    makeCountry("mu", { nameEn: "Mauritius" }),
    makeCountry("ni", { nameEn: "Niger" }),
    makeCountry("ng", { nameEn: "Nigeria" }),
  ];

  it("「National anthem of …」や国名そのもののカテゴリで決める", () => {
    expect(matchCountry(["National anthem of Kenya"], "File:x.ogg", countries)?.id).toBe("ke");
    expect(matchCountry(["Mauritius"], "File:Motherland.ogg", countries)?.id).toBe("mu");
  });

  it("ファイル名は単語として照合し、別の語の一部には一致させない", () => {
    expect(matchCountry([], "File:Lupang Hinirang instrumental.ogg", countries)).toBeUndefined();
    expect(matchCountry([], "File:Desteapta-te, romane!.ogg", countries)).toBeUndefined();
    expect(matchCountry([], "File:Nigeria National Anthem.ogg", countries)?.id).toBe("ng");
  });
});

describe("isFormerAnthem", () => {
  it("旧国歌を見分ける", () => {
    expect(isFormerAnthem("File:Former national anthem of Nepal, 1962–2006.oga", [])).toBe(true);
    expect(isFormerAnthem("File:Anthem of Kazakhstan 1991-2006.ogg", [])).toBe(true);
    expect(isFormerAnthem("File:National Anthem of Kazakhstan (Instrumental).ogg", [])).toBe(false);
  });
});

describe("非公開版のデプロイの確認", () => {
  it("wrangler の出力から workers.dev の URL を取り出す", () => {
    const output =
      "Uploaded national-anthem-quiz-private\n  https://national-anthem-quiz-private.abc.workers.dev\n";
    expect(findWorkersDevUrl(output)).toBe("https://national-anthem-quiz-private.abc.workers.dev");
    expect(findWorkersDevUrl("no url")).toBeUndefined();
  });

  it("Cloudflare Access のログイン画面へのリダイレクトだけを保護とみなす", () => {
    const login = "https://myteam.cloudflareaccess.com/cdn-cgi/access/login/x";
    expect(isAccessLoginRedirect(302, login)).toBe(true);
    expect(isAccessLoginRedirect(200, null)).toBe(false);
    expect(isAccessLoginRedirect(302, "https://example.com/login")).toBe(false);
    expect(isAccessLoginRedirect(302, "https://cloudflareaccess.com.evil.example/")).toBe(false);
  });

  it("ページと音源の両方がログイン画面に移らなければ問題として返す", async () => {
    const protectedFetch = async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://myteam.cloudflareaccess.com/cdn-cgi/access/login/x" },
      });
    const openFetch = async () => new Response("ok", { status: 200 });
    const base = "https://site.example.workers.dev";
    expect(await checkAccessProtected(base, protectedFetch)).toEqual([]);
    expect(await checkAccessProtected(base, openFetch)).toHaveLength(2);
  });
});

describe("deployPrivate（非公開版のデプロイの手順）", () => {
  const out = (url: string) => `Deployed national-anthem-quiz-private\n  ${url}\n`;
  /** 呼ばれた手順を記録する偽物。deployUrls は空のページ・全曲の各デプロイが出す URL の順 */
  function fakeDeps(deployUrls: string[], protectedUrls: string[]) {
    const calls: string[] = [];
    let i = 0;
    return {
      calls,
      deps: {
        deployPlaceholder: () => (calls.push("placeholder"), out(deployUrls[i++]!)),
        buildAndDeploy: () => (calls.push("full"), out(deployUrls[i++]!)),
        check: async (url: string) =>
          protectedUrls.includes(url) ? [] : [`${url} は保護されていない`],
        log: () => {},
      },
    };
  }
  const A = "https://national-anthem-quiz-private.a.workers.dev";
  const B = "https://other-worker.b.workers.dev";

  it("実際の上げ先（空のページを上げた先）が保護されていなければ、全曲を上げない", async () => {
    // 以前保存した URL が保護されていても、今の上げ先が別の Worker なら止まる
    const { deps, calls } = fakeDeps([B], [A]);
    await expect(deployPrivate(deps, false)).rejects.toThrow();
    expect(calls).toEqual(["placeholder"]);
  });

  it("保護された上げ先なら全曲を上げ、上げた後にも同じ URL と保護を確かめる", async () => {
    const { deps, calls } = fakeDeps([A, A], [A]);
    await expect(deployPrivate(deps, false)).resolves.toBe(A);
    expect(calls).toEqual(["placeholder", "full"]);
  });

  it("全曲を上げた先が確かめた URL と違えば、すぐに空のページに戻して止まる", async () => {
    const { deps, calls } = fakeDeps([A, B, B], [A]);
    await expect(deployPrivate(deps, false)).rejects.toThrow();
    expect(calls).toEqual(["placeholder", "full", "placeholder"]);
  });

  it("--placeholder では空のページだけを上げ、保護を確かめない", async () => {
    const { deps, calls } = fakeDeps([A], []);
    await expect(deployPrivate(deps, true)).resolves.toBe(A);
    expect(calls).toEqual(["placeholder"]);
  });
});

describe("canReuseAudio（pnpm fetch:local で取得済みの音源を使い回すか）", () => {
  it("前回と同じ出典のときだけ使い回す（取得元が変われば取り直す）", () => {
    expect(canReuseAudio(true, "https://x/a", "https://x/a")).toBe(true);
    expect(canReuseAudio(true, "https://x/a", "https://x/b")).toBe(false);
    expect(canReuseAudio(true, undefined, "https://x/a")).toBe(false);
    expect(canReuseAudio(false, "https://x/a", "https://x/a")).toBe(false);
  });
});
