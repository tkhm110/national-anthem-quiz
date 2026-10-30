import type { Difficulty, QuizRegion } from "../schema";

/** モード選択に並べる地域（表示順） */
export const QUIZ_REGIONS: readonly { value: QuizRegion; label: string }[] = [
  { value: "world", label: "全世界" },
  { value: "asia", label: "アジア" },
  { value: "europe", label: "ヨーロッパ" },
  { value: "africa", label: "アフリカ" },
  { value: "north-america", label: "北アメリカ" },
  { value: "south-america", label: "南アメリカ" },
  { value: "oceania", label: "オセアニア" },
];

export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4];
