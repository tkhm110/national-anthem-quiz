/**
 * pnpm fetch:local [--dry-run]
 * 私的利用専用。Wikimedia Commons の「米海軍軍楽隊が演奏した国歌」のカテゴリから、
 * 公開版（data/anthems）に入っていない国の音源（MP3 の変換版）を local/ に集め、国データを作る。
 * local/ は git の管理外で、公開サイトのビルドには入らない（docs/development.md「全曲入りの非公開版」）。
 * 権利の確認はしていないので、公開してはいけない。
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDataset } from "../src/lib/data/validate";
import type { Anthem, Country } from "../src/lib/schema";
import { checkAudioFiles, readDurationWithMusicMetadata } from "./lib/check-audio";
import { readDataDir } from "./lib/read-data-dir";
import {
  LOCAL_ANTHEMS_DIR,
  LOCAL_AUDIO_DIR,
  isFormerAnthem,
  matchCountry,
  readLocalAnthemFiles,
  writeFileCreatingDir,
} from "./lib/local-anthems";
import { EXTRA_SOURCES, type ExtraSource } from "./lib/local-extra-sources";

const API = "https://commons.wikimedia.org/w/api.php";
const UA = "national-anthem-quiz-local-fetch/1.0 (https://github.com/tkhm110/national-anthem-quiz)";
const CATEGORY =
  "Category:Audio files of national anthems performed by the United States Navy Band";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const dataDir = join(rootDir, "data");
const anthemsDir = join(rootDir, LOCAL_ANTHEMS_DIR);
const audioDir = join(rootDir, LOCAL_AUDIO_DIR);
/** 米海軍以外の音源の、変換前のファイル */
const rawDir = join(rootDir, "local", "raw");
const dryRun = process.argv.includes("--dry-run");

/** カテゴリやファイル名から国を決められないファイル（曲名だけのもの）の対応表 */
const TITLE_OVERRIDES: Record<string, string> = {
  "File:Hu-magyarhimnusz.ogg": "hu",
  "File:Istiklâl Marsi instrumetal.ogg": "tr",
  "File:Mazurek Dabrowskiego.ogg": "pl",
  "File:Mila Rodino instrumental.ogg": "bg",
  "File:Marcha Real-Royal March by US Navy Band.ogg": "es",
  "File:Peace to the Sultan (نشيد السلام السلطاني).ogg": "om",
  "File:Sayaun Thunga Phool Ka (instrumental).ogg": "np",
  "File:Thai National Anthem - US Navy Band.ogg": "th",
  "File:The National Anthem of the Republic of Korea.ogg": "kr",
  "File:Belau rekid (instrumental).oga": "pw",
  "File:Gaumii salaam.ogg": "mv",
  "File:As Salam Al Amiri instrumental.ogg": "qa",
  "File:Lupang Hinirang instrumental.ogg": "ph",
  "File:Desteapta-te, romane!.ogg": "ro",
  "File:Georgian national anthem.oga": "ge",
  "File:Iraqi national anthem, performed by the U.S. Navy Band.wav": "iq",
  "File:Malawian national anthem.oga": "mw",
  "File:Serbian national anthem, instrumental.oga": "rs",
};

type ApiPage = {
  title: string;
  categories?: { title: string }[];
  revisions?: { slots: { main: { content: string } } }[];
  videoinfo?: { duration?: number; derivatives?: { src: string; transcodekey?: string }[] }[];
};

type ApiResponse = {
  query?: { pages?: ApiPage[]; categorymembers?: { title: string }[] };
  continue?: Record<string, string>;
};

async function api(params: Record<string, string>): Promise<ApiResponse> {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as ApiResponse;
}

async function listCategoryFiles(): Promise<string[]> {
  const titles: string[] = [];
  let cont: Record<string, string> | undefined = {};
  while (cont) {
    const data = await api({
      action: "query",
      list: "categorymembers",
      cmtitle: CATEGORY,
      cmlimit: "500",
      cmtype: "file",
      ...cont,
    });
    titles.push(...(data.query?.categorymembers ?? []).map((m) => m.title));
    cont = data.continue;
  }
  return titles;
}

async function fetchPages(titles: string[]): Promise<ApiPage[]> {
  const pages: ApiPage[] = [];
  for (let i = 0; i < titles.length; i += 20) {
    const data = await api({
      action: "query",
      titles: titles.slice(i, i + 20).join("|"),
      prop: "categories|revisions|videoinfo",
      cllimit: "max",
      rvprop: "content",
      rvslots: "main",
      viprop: "derivatives|size",
    });
    pages.push(...(data.query?.pages ?? []));
  }
  return pages;
}

/** ファイルページの {{Musical work}} の title 欄から曲名を取る。取れなければファイル名から作る */
function anthemTitleOf(page: ApiPage): string {
  const text = page.revisions?.[0]?.slots.main.content ?? "";
  const raw = /\|\s*title\s*=([^\n]*)/i.exec(text)?.[1] ?? "";
  const cleaned = raw
    // {{w|曲名|…}} や {{en|1=曲名}} は、最初の引数だけを残す
    .replace(/\{\{\s*[^{}|]+\|(?:\s*1\s*=)?([^{}|]*)(?:\|[^{}]*)?\}\}/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/["“”«»]/g, "");
  const fromPage = tidyTitle(cleaned);
  // 曲名欄が崩れている（記号だけ・言語コードだけ・テンプレートの引数）ときはファイル名から作る
  if (fromPage.length >= 4 && !fromPage.includes("=")) return fromPage;
  return tidyTitle(page.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""));
}

/** 太字などの記法と、演奏者・「instrumental」などの付け足しを除く */
function tidyTitle(title: string): string {
  return title
    .replace(/'{2,}/g, "")
    .replace(/_/g, " ")
    .replace(/^(?:U\.S\.|United States) Navy Band\s*-\s*/i, "")
    .replace(/\s*-\s*(?:U\.S\.|US) Navy Band$/i, "")
    .replace(/,?\s+(?:performed|played)\s+by\s+.*$/i, "")
    .replace(/\s+by\s+(?:the\s+)?(?:U\.S\.|US|United States)\s+Navy\s*Band.*$/i, "")
    .replace(/\s*\(?\binstrumental\b\)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,;:-]+$/, "")
    .trim();
}

/**
 * Commons にない国の、米海軍軍楽隊の公式サイトにあった MP3 のファイル名（ウェイバックマシンに保存されているもの）。
 * congo.mp3 は、旧サイトで「Congo (Republic of)」「Zaire」と別に置かれていた「Congo」と同じ中身で、
 * どちらとも曲が違うので、コンゴ民主共和国の現行の国歌とみなす。nigeria.mp3 は2024年に変わる前の旧国歌なので使わない。
 */
const WAYBACK_FILES: Record<string, string> = {
  ba: "bosnia-herzegovina.mp3",
  cd: "congo.mp3",
  lt: "lithuania.mp3",
  lv: "latvia.mp3",
  mk: "macedonia.mp3",
  se: "sweden.mp3",
  si: "slovenia.mp3",
  sk: "slovak-republic.mp3",
  va: "holy-see.mp3",
  ae: "united-arab-emirates.mp3",
  in: "india.mp3",
  ir: "iran.mp3",
  kh: "cambodia.mp3",
  lk: "sri-lanka.mp3",
  mn: "mongolia.mp3",
  uz: "uzbekistan.mp3",
  vn: "vietnam.mp3",
  ye: "yemen.mp3",
  ao: "angola.mp3",
  ci: "cote-divoire.mp3",
  cm: "cameroon.mp3",
  et: "ethiopia.mp3",
  gw: "guinea-bissau.mp3",
  mz: "mozambique.mp3",
  na: "namibia.mp3",
  sl: "sierra-leone.mp3",
  tg: "togo.mp3",
  tn: "tunisia.mp3",
  gt: "guatemala.mp3",
  kn: "st-kitts-and-nevis.mp3",
  vu: "vanuatu.mp3",
};

/** 同じ国歌を使う国（国ID → 録音をコピーする元の公開版の国ID）。同一旋律グループにも入っている */
const SAME_ANTHEM_COPIES: Record<string, string> = { cy: "gr" };

type Snapshot = { original: string; timestamp: string };

/** ウェイバックマシンの一覧の API は不安定なので、取れた一覧を保存しておき、取れないときはそれを使う */
const waybackCacheFile = join(rootDir, "local", "wayback-index.json");

/** ウェイバックマシンに保存されている、米海軍軍楽隊のサイトの国歌の MP3（小文字のファイル名 → 最新の保存） */
async function listWaybackFiles(): Promise<Map<string, Snapshot>> {
  const files = new Map<string, Snapshot>();
  let rows: string[][] = [];
  try {
    for (const path of ["navyband.navy.mil/music/anthems/*", "navyband.navy.mil/anthems/*"]) {
      const url = `https://web.archive.org/cdx/search/cdx?${new URLSearchParams({
        url: path,
        output: "json",
        fl: "original,timestamp",
        filter: "statuscode:200",
        collapse: "urlkey",
        limit: "5000",
      })}`;
      const body = await download(url);
      if (!body) throw new Error(`取得できませんでした：${url}`);
      rows.push(...(JSON.parse(body.toString("utf8")) as string[][]).slice(1));
    }
    // --dry-run では何も書かない
    if (!dryRun) writeFileCreatingDir(waybackCacheFile, JSON.stringify(rows));
  } catch (error) {
    if (!existsSync(waybackCacheFile)) throw error;
    console.warn("[WARN] ウェイバックマシンの一覧を取得できないため、前回保存した一覧を使う");
    rows = JSON.parse(readFileSync(waybackCacheFile, "utf8")) as string[][];
  }
  {
    for (const [original, timestamp] of rows) {
      if (!original || !timestamp || !/\.mp3$/i.test(original)) continue;
      const name = decodeURIComponent(original.slice(original.lastIndexOf("/") + 1)).toLowerCase();
      const current = files.get(name);
      if (!current || timestamp > current.timestamp) files.set(name, { original, timestamp });
    }
  }
  return files;
}

/**
 * 米海軍以外の音源を、前後の無音を除き、音量を米海軍の録音（おおむね -13〜-16 LUFS）に合わせて
 * -15 LUFS にそろえ、192kbps の MP3 にする。成功すれば true
 */
function convertToMp3(input: string, output: string): boolean {
  const trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.2";
  const filters = `${trim},areverse,${trim},areverse,loudnorm=I=-15:TP=-1.5:LRA=11`;
  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        input,
        "-map_metadata",
        "-1",
        "-af",
        filters,
        "-ar",
        "44100",
      ].concat(["-codec:a", "libmp3lame", "-b:a", "192k", output]),
      { stdio: "pipe" },
    );
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 相手の負荷を避けるため、1件ごとに間を空け、429・503 や接続の切断のときは待ってやり直す */
async function download(url: string): Promise<Buffer | undefined> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(2000);
    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      console.warn(`[INFO] 接続のエラー（${String(error)}）のため 30秒待つ`);
      await sleep(30_000);
      continue;
    }
    if (res.status !== 429 && res.status !== 503) return undefined;
    const wait = Number(res.headers.get("retry-after")) || 30;
    console.warn(`[INFO] ${res.status} のため ${wait}秒待つ`);
    await sleep(wait * 1000);
  }
  return undefined;
}

function mp3Of(page: ApiPage): string | undefined {
  return page.videoinfo?.[0]?.derivatives?.find((d) => d.transcodekey === "mp3")?.src;
}

const raw = readDataDir(dataDir);
const base = validateDataset(raw, "production");
if (!base.ok) throw new Error("data/ の検証に失敗しました。pnpm validate:data で確認してください");
const publicIds = new Set(base.data.anthems.map((a) => a.id));
const countries: Country[] = base.data.countries;

const titles = await listCategoryFiles();
const pages = await fetchPages(titles);
console.log(`[INFO] カテゴリのファイル ${pages.length}件`);

/** 国ID → 候補のページ。同じ国に複数あれば、MP3 の変換版があり、長いものを選ぶ */
const chosen = new Map<string, ApiPage>();
const unmatched: string[] = [];
for (const page of pages) {
  const categories = (page.categories ?? []).map((c) => c.title.replace(/^Category:/, ""));
  if (isFormerAnthem(page.title, categories)) continue;
  const overrideId = TITLE_OVERRIDES[page.title];
  const country = overrideId
    ? countries.find((c) => c.id === overrideId)
    : matchCountry(categories, page.title, countries);
  if (!country) {
    unmatched.push(page.title);
    continue;
  }
  if (publicIds.has(country.id) || !mp3Of(page)) continue;
  const current = chosen.get(country.id);
  const duration = page.videoinfo?.[0]?.duration ?? 0;
  if (!current || duration > (current.videoinfo?.[0]?.duration ?? 0)) chosen.set(country.id, page);
}

for (const title of unmatched) console.warn(`[WARN] 国を特定できない：${title}`);

/**
 * 1か国分の取得元。音源の URL（copyFrom のときはコピー元のファイル）と、国データに書く曲名・出典。
 * extra は米海軍以外の音源（ffmpeg で無音を除き、音量をそろえて MP3 にする）
 */
type Source = {
  id: string;
  title: string;
  sourceUrl: string;
  mp3Url?: string;
  copyFrom?: string;
  extra?: ExtraSource;
};
const sources = new Map<string, Source>();
for (const [id, page] of chosen) {
  sources.set(id, {
    id,
    title: anthemTitleOf(page),
    sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURI(page.title.replace(/ /g, "_"))}`,
    mp3Url: mp3Of(page),
  });
}
console.log(`[INFO] Commons から ${sources.size}か国`);

// Commons にない国は、米海軍軍楽隊の公式サイトにあった MP3（ウェイバックマシンの保存）から取る
const archived = await listWaybackFiles();
for (const [id, name] of Object.entries(WAYBACK_FILES)) {
  if (publicIds.has(id) || sources.has(id)) continue;
  const snapshot = archived.get(name);
  if (!snapshot) {
    console.warn(`[WARN] ${id}: ウェイバックマシンに ${name} がない`);
    continue;
  }
  sources.set(id, {
    id,
    title: `National anthem of ${countries.find((c) => c.id === id)!.nameEn}`,
    sourceUrl: `https://web.archive.org/web/${snapshot.timestamp}/${snapshot.original}`,
    mp3Url: `https://web.archive.org/web/${snapshot.timestamp}id_/${snapshot.original}`,
  });
}

// 同じ国歌を使う国は、もう一方の録音をコピーする
for (const [id, fromId] of Object.entries(SAME_ANTHEM_COPIES)) {
  if (publicIds.has(id) || sources.has(id)) continue;
  const from = base.data.anthems.find((a) => a.id === fromId);
  if (!from) continue;
  sources.set(id, {
    id,
    title: from.anthemTitle.original,
    sourceUrl: from.license.sourceUrl,
    copyFrom: join(rootDir, "public", "audio", from.audio.file),
  });
}

// 米海軍の録音がどこにもない国は、ほかの器楽の音源を使う（scripts/lib/local-extra-sources.ts）
for (const [id, extra] of Object.entries(EXTRA_SOURCES)) {
  if (publicIds.has(id) || sources.has(id)) continue;
  sources.set(id, { id, title: extra.original, sourceUrl: extra.page, mp3Url: extra.url, extra });
}

console.log(`[INFO] 公開版にない国 ${sources.size}か国`);
if (dryRun) {
  for (const s of [...sources.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`  ${s.id}  ${countries.find((c) => c.id === s.id)!.nameEn}  ←  ${s.sourceUrl}`);
  }
  process.exit(0);
}

mkdirSync(anthemsDir, { recursive: true });
mkdirSync(audioDir, { recursive: true });
for (const source of [...sources.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  const { id } = source;
  const file = `${id}.mp3`;
  const audioPath = join(audioDir, file);
  if (!existsSync(audioPath)) {
    if (source.copyFrom) {
      copyFileSync(source.copyFrom, audioPath);
    } else if (source.extra) {
      const body = await download(source.mp3Url!);
      if (!body) {
        console.warn(`[WARN] ${id}: ダウンロードに失敗`);
        continue;
      }
      const rawPath = join(rawDir, `${id}${extname(new URL(source.mp3Url!).pathname)}`);
      mkdirSync(rawDir, { recursive: true });
      writeFileSync(rawPath, body);
      if (!convertToMp3(rawPath, audioPath)) {
        console.warn(`[WARN] ${id}: ffmpeg での変換に失敗（ffmpeg が必要）`);
        continue;
      }
    } else {
      const body = await download(source.mp3Url!);
      if (!body) {
        console.warn(`[WARN] ${id}: ダウンロードに失敗`);
        continue;
      }
      writeFileSync(audioPath, body);
    }
  }
  const duration = await readDurationWithMusicMetadata(audioPath);
  if (!duration) {
    console.warn(`[WARN] ${id}: 長さを読み取れない`);
    continue;
  }
  const country = countries.find((c) => c.id === id)!;
  const anthem: Anthem = {
    id,
    nameJa: country.nameJa,
    nameEn: country.nameEn,
    anthemTitle: source.extra
      ? { original: source.title, ja: source.extra.ja }
      : { original: source.title },
    audio: { file, durationSec: Math.round(duration * 100) / 100 },
    license: {
      ...(source.extra?.license ?? { type: "public-domain", author: "United States Navy Band" }),
      sourceUrl: source.sourceUrl,
      note: `私的利用専用（全曲入りの非公開版）。楽曲・編曲の権利は確認していないので、公開しない${
        source.extra ? `。${source.extra.note}。取得元：${source.mp3Url}` : ""
      }`,
    },
  };
  writeFileSync(join(anthemsDir, `${id}.json`), `${JSON.stringify(anthem, null, 2)}\n`);
  console.log(`  ${id}  ${anthem.anthemTitle.original}`);
}

// 公開版と合わせて検証する（ビルド時と同じ条件。公開版にある国は local/ の方を使わない）
const publicNames = new Set(raw.anthemFiles.map((f) => f.fileName));
const merged = validateDataset(
  {
    ...raw,
    anthemFiles: [...raw.anthemFiles, ...readLocalAnthemFiles(anthemsDir, publicNames)],
  },
  "production",
);
if (!merged.ok) {
  for (const issue of merged.issues) console.error(`  - ${issue.file}: ${issue.message}`);
  throw new Error("local/ のデータの検証に失敗しました");
}
const localAnthems = merged.data.anthems.filter((a) => !publicIds.has(a.id));
const audio = await checkAudioFiles(localAnthems, audioDir);
if (audio.issues.length > 0) {
  for (const issue of audio.issues) console.error(`  - ${issue.file}: ${issue.message}`);
  throw new Error("local/audio の検証に失敗しました");
}
console.log(
  `[OK] local/ に ${localAnthems.length}か国（公開版と合わせて ${merged.data.anthems.length}か国）`,
);
