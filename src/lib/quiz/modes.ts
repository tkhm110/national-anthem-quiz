import type { Difficulty, Region } from "../schema";

export type QuizRegionSetting = {
  value: string;
  label: string;
  /** 対象にする国の地域（countries.json の region）。"all" は全世界 */
  regions: readonly Region[] | "all";
};

/**
 * モード選択に並べる地域（表示順）。国の地域（6つ）を、収録数が偏らないようにまとめている。
 * 区切り方を変えるときは、ここだけを書き換えればよい。
 */
export const QUIZ_REGIONS = [
  { value: "world", label: "全世界", regions: "all" },
  { value: "asia-oceania", label: "アジア・オセアニア", regions: ["asia", "oceania"] },
  { value: "europe", label: "ヨーロッパ", regions: ["europe"] },
  { value: "americas", label: "アメリカ", regions: ["north-america", "south-america"] },
  { value: "africa", label: "アフリカ", regions: ["africa"] },
] as const satisfies readonly QuizRegionSetting[];

/** クイズ条件としての地域 */
export type QuizRegion = (typeof QUIZ_REGIONS)[number]["value"];

/** その地域を選んだときに対象になる、国の地域か */
export function isInQuizRegion(quizRegion: QuizRegion, region: Region): boolean {
  const setting: QuizRegionSetting = QUIZ_REGIONS.find((r) => r.value === quizRegion)!;
  return setting.regions === "all" || setting.regions.includes(region);
}

export function quizRegionLabel(quizRegion: QuizRegion): string {
  return QUIZ_REGIONS.find((r) => r.value === quizRegion)!.label;
}

export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4];
