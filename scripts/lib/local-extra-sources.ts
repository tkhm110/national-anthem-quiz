/**
 * 全曲入りの非公開版（私的利用専用）で、米海軍軍楽隊の録音が見つからない国の音源（pnpm fetch:local が使う）。
 * 吹奏楽・管弦楽に近い器楽の音源を選んだ。取得後に ffmpeg で無音を除き、音量を米海軍の録音にそろえて MP3 にする。
 * 権利は確認していない。公開する前に、note に書いた点を含めて作曲・編曲・録音を確かめる。
 */
import type { License } from "../../src/lib/schema";

export type ExtraSource = {
  /** 音源ファイルの URL（MP3 か Ogg） */
  url: string;
  /** 出典（取得元のページ） */
  page: string;
  original: string;
  ja: string;
  license: Omit<License, "sourceUrl" | "note">;
  /** 演奏の種類と、公開前に確かめること */
  note: string;
};

const NAI = "nationalanthems.info（CC BY 4.0）";
const nai = (id: string, original: string, ja: string, note: string): ExtraSource => ({
  url: `https://nationalanthems.info/${id}.mp3`,
  page: `https://nationalanthems.info/${id}.htm`,
  original,
  ja,
  license: { type: "cc-by", author: NAI },
  note,
});
/** 楽譜作成ソフト Sibelius で楽譜から作った音源（ファイルのタグによる）。実演ではない */
const SIBELIUS = "Sibelius で楽譜から作った音源（実演ではない）";

export const EXTRA_SOURCES: Record<string, ExtraSource> = {
  ad: nai("ad", "El Gran Carlemany", "偉大なるカール大帝", SIBELIUS),
  sm: nai(
    "sm",
    "Inno Nazionale della Repubblica",
    "サンマリノ共和国国歌",
    "実演の録音とみられる（タグに作成ソフトの表記なし）。演奏者は未確認",
  ),
  bt: nai(
    "bt",
    "Druk Tsendhen",
    "雷龍の王国",
    "実演の録音とみられる（タグに作成ソフトの表記なし）。演奏者は未確認",
  ),
  kp: nai(
    "kp",
    "애국가（Aegukka）",
    "愛国歌",
    "実演の録音とみられる（タグに作成ソフトの表記なし）。演奏者は未確認",
  ),
  ps: nai("ps", "فدائي（Fida'i）", "フィダーイー（戦士）", SIBELIUS),
  tw: nai("tw", "中華民國國歌", "中華民国国歌", SIBELIUS),
  bi: nai("bi", "Burundi Bwacu", "我らがブルンジ", SIBELIUS),
  zm: nai(
    "zm",
    "Stand and Sing of Zambia, Proud and Free",
    "立ち上がり歌え、誇り高く自由なザンビアを",
    "実演の録音とみられる（タグに作成ソフトの表記なし）。演奏者は未確認。旋律はタンザニアと同じ Sontonga の曲",
  ),
  zw: nai("zw", "Simudzai Mureza wedu WeZimbabwe", "ジンバブエの国旗を掲げよ", SIBELIUS),
  gd: nai("gd", "Hail Grenada", "万歳グレナダ", SIBELIUS),
  nr: nai(
    "nr",
    "Nauru Bwiema",
    "ナウル、我らが祖国",
    `${SIBELIUS}。タグの曲名が「Marshall Islands National Anthem」になっているので、ナウル国歌か聴いて確かめる`,
  ),
  sb: nai("sb", "God Save Our Solomon Islands", "神よ、ソロモン諸島を守りたまえ", SIBELIUS),
  to: nai("to", "Ko e fasi ʻo e tuʻi ʻo e ʻOtu Tonga", "トンガ諸島の王の歌", SIBELIUS),
  tv: nai("tv", "Tuvalu mo te Atua", "ツバルは全能の神と共に", SIBELIUS),
  ws: nai("ws", "O le Fuʻa o le Saʻolotoga o Sāmoa", "自由の旗", SIBELIUS),
  ne: {
    url: "https://upload.wikimedia.org/wikipedia/commons/c/cd/%C2%ABL%27Honneur_de_la_Patrie%C2%BB_performed_by_the_Royal_Netherlands_Army_Band_instrumental.ogg",
    page: "https://commons.wikimedia.org/wiki/File:%C2%ABL%27Honneur_de_la_Patrie%C2%BB_performed_by_the_Royal_Netherlands_Army_Band_instrumental.ogg",
    original: "L'Honneur de la Patrie",
    ja: "祖国の名誉",
    license: { type: "cc0", author: "Thisizmyyuzer（Wikimedia Commons）" },
    note: "オランダ陸軍軍楽隊の演奏を、Commons の利用者がハーグで録音したもの（2026年5月、CC0）。楽曲は2023年制定の現行国歌で、作曲の権利は未確認。演奏者（軍楽隊）の権利も未確認",
  },
  ng: {
    url: "https://upload.wikimedia.org/wikipedia/commons/8/8a/Nigeria%2C_We_Hail_Thee_-_Banda_do_Batalh%C3%A3o_da_Guarda_Presidencial%2C_2025.ogg",
    page: "https://commons.wikimedia.org/wiki/File:Nigeria,_We_Hail_Thee_-_Banda_do_Batalh%C3%A3o_da_Guarda_Presidencial,_2025.ogg",
    original: "Nigeria, We Hail Thee",
    ja: "ナイジェリアよ、我らは汝を讃える",
    license: {
      type: "cc-by",
      author: "Banda do Batalhão da Guarda Presidencial（Canal Gov、CC BY 4.0）",
    },
    note: "ブラジル陸軍大統領警護大隊軍楽隊の演奏（2025年8月、ブラジル政府の YouTube の中継から）。Commons でライセンスの確認待ち（License review needed）。楽曲（1960年作曲）はナイジェリア国内の PD の表示だけで、米国・日本での権利は未確認",
  },
};
