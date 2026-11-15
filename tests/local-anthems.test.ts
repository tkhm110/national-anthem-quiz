import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isFormerAnthem, matchCountry } from "../scripts/lib/local-anthems";
import { PRIVATE_MODE, localAnthemsModuleSource } from "../scripts/lib/vite-local-anthems";
import {
  checkAccessProtected,
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
