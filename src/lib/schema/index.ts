import { z } from "zod";

/** 国データに格納する地域。「世界」はクイズ条件の特別値なのでここには含めない。 */
export const RegionSchema = z.enum([
  "asia",
  "europe",
  "africa",
  "north-america",
  "south-america",
  "oceania",
]);

/** 1=初級 / 2=中級 / 3=上級 / 4=超級 */
export const DifficultySchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

/** 国ID。当面は ISO 3166-1 alpha-2 に沿った小文字2文字。 */
export const CountryIdSchema = z.string().regex(/^[a-z]{2}$/, "国IDは小文字2文字にしてください");

export const LicenseSchema = z.object({
  type: z.enum(["public-domain", "cc0", "cc-by", "cc-by-sa"]),
  author: z.string().min(1),
  sourceUrl: z.url({ protocol: /^https?$/ }),
  note: z.string().optional(),
});

/**
 * 音源ファイル名。ディレクトリを含まない basename（拡張子込み）のみ許可する。
 * 先頭を英数字に限定しているため、"../" や "/" や "." 始まりの名前は通らない。
 */
export const AudioFileNameSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9._-]*\.(mp3|ogg)$/,
    "音源ファイル名は英小文字・数字・'.'・'_'・'-' からなる .mp3/.ogg の basename にしてください",
  )
  .refine((name) => !name.includes(".."), "音源ファイル名に '..' は使えません");

export const AnthemSchema = z.strictObject({
  id: CountryIdSchema,
  nameJa: z.string().min(1),
  nameEn: z.string().min(1),
  anthemTitle: z.strictObject({
    original: z.string().min(1),
    ja: z.string().optional(),
  }),
  region: RegionSchema,
  /** 出題対象として登場する最低難易度 */
  difficulty: DifficultySchema,
  audio: z.strictObject({
    file: AudioFileNameSchema,
    durationSec: z.number().positive().finite(),
  }),
  composer: z.string().optional(),
  adoptedYear: z.number().int().optional(),
  license: LicenseSchema,
});

export const MelodyRelationTypeSchema = z.enum(["identical", "similar"]);

export const MelodyGroupSchema = z.strictObject({
  id: z.string().min(1),
  relationType: MelodyRelationTypeSchema,
  countryIds: z.array(CountryIdSchema).min(2),
  description: z.string().min(1),
});

export const MelodyGroupsFileSchema = z.array(MelodyGroupSchema);

export type Region = z.infer<typeof RegionSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type License = z.infer<typeof LicenseSchema>;
export type Anthem = z.infer<typeof AnthemSchema>;
export type MelodyRelationType = z.infer<typeof MelodyRelationTypeSchema>;
export type MelodyGroup = z.infer<typeof MelodyGroupSchema>;

/** クイズ条件としての地域（"world" は全地域を対象にする特別値） */
export type QuizRegion = Region | "world";
