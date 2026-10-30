import { describe, expect, it } from "vitest";
import { mulberry32, randomInt, shuffle } from "../src/lib/random";
import {
  buildMelodyRelations,
  computeClip,
  DIFFICULTY_SETTINGS,
  type ClipSetting,
} from "../src/lib/quiz";
import type { MelodyGroup } from "../src/lib/schema";
import { loadFixtureDataset } from "./helpers";

function group(id: string, relationType: MelodyGroup["relationType"], countryIds: string[]) {
  return { id, relationType, countryIds, description: "test" };
}

describe("旋律関係", () => {
  it("identical は推移閉包で同一クラスになる（xa=xb, xb=xg → xa=xg）", () => {
    const { melodyGroups } = loadFixtureDataset();
    const r = buildMelodyRelations(melodyGroups);
    expect(r.identicalClassOf("xa")).toBe(r.identicalClassOf("xg"));
    expect(r.identicalClassOf("xb")).toBe(r.identicalClassOf("xg"));
    expect(r.identicalClassOf("xp")).toBe(r.identicalClassOf("xq"));
    expect(r.identicalClassOf("xa")).not.toBe(r.identicalClassOf("xp"));
    // グループに属さない国はそれぞれ独立したクラス
    expect(r.identicalClassOf("xc")).not.toBe(r.identicalClassOf("xd"));
  });

  it("similar は禁止組（同一クラス）にならず、推移的にも扱わない", () => {
    const { melodyGroups } = loadFixtureDataset();
    const r = buildMelodyRelations(melodyGroups);
    expect(r.identicalClassOf("xc")).not.toBe(r.identicalClassOf("xh"));
    expect(r.isSimilar("xc", "xh")).toBe(true);
    expect(r.isSimilar("xh", "xd")).toBe(true);
    expect(r.isSimilar("xc", "xd")).toBe(false);
    expect(r.isSimilar("xc", "xc")).toBe(false);
  });

  it("グループの記述順によらず同じクラス代表になる", () => {
    const a = buildMelodyRelations([
      group("1", "identical", ["xc", "xb"]),
      group("2", "identical", ["xb", "xa"]),
    ]);
    const b = buildMelodyRelations([
      group("2", "identical", ["xa", "xb"]),
      group("1", "identical", ["xb", "xc"]),
    ]);
    for (const id of ["xa", "xb", "xc"]) {
      expect(a.identicalClassOf(id)).toBe("xa");
      expect(b.identicalClassOf(id)).toBe("xa");
    }
  });

  it("3か国以上の identical グループも1クラスにまとまる", () => {
    const r = buildMelodyRelations([group("g", "identical", ["xc", "xa", "xb"])]);
    expect(new Set(["xa", "xb", "xc"].map(r.identicalClassOf)).size).toBe(1);
  });
});

describe("シード付き乱数", () => {
  it("同じシードなら同じ数列、異なるシードなら異なる数列", () => {
    const seq = (seed: number) => {
      const rng = mulberry32(seed);
      return Array.from({ length: 5 }, rng);
    };
    expect(seq(42)).toEqual(seq(42));
    expect(seq(42)).not.toEqual(seq(43));
  });

  it("値は [0, 1) に収まる", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 10000; i++) {
      const v = rng();
      expect(v >= 0 && v < 1).toBe(true);
    }
  });

  it("randomInt は rng が 1 を返しても範囲外にならない", () => {
    expect(randomInt(() => 1, 5)).toBe(4);
    expect(randomInt(() => 0, 5)).toBe(0);
  });

  it("shuffle は元の配列を変えず、要素を並べ替えるだけ", () => {
    const items = [1, 2, 3, 4, 5, 6];
    const result = shuffle(items, mulberry32(7));
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...result].sort()).toEqual(items);
  });
});

describe("再生区間の計算", () => {
  const rng = () => 0.999999;

  // computeClip 自体のテストは、難易度の設定値に依存させず個別の設定で行う
  const fromBeginning: ClipSetting = { start: "beginning", durationSec: 15 };
  const fromMiddle: ClipSetting = { start: "random", durationSec: 5 };

  it("現在の設定：全難易度で冒頭から60秒（イントロの無音対策）", () => {
    for (const difficulty of [1, 2, 3, 4] as const) {
      expect(DIFFICULTY_SETTINGS[difficulty].clip).toEqual({ start: "beginning", durationSec: 60 });
      expect(computeClip(90, DIFFICULTY_SETTINGS[difficulty].clip, rng)).toEqual({
        startSec: 0,
        durationSec: 60,
      });
    }
  });

  it("冒頭から再生する設定では、乱数によらず開始位置は0", () => {
    expect(computeClip(60, fromBeginning, rng)).toEqual({ startSec: 0, durationSec: 15 });
    expect(computeClip(60, fromBeginning, () => 0)).toEqual({ startSec: 0, durationSec: 15 });
  });

  it("途中から再生する設定では、音源の末尾を超えない", () => {
    for (const value of [0, 0.5, 0.999999]) {
      const clip = computeClip(37.3, fromMiddle, () => value);
      expect(clip.durationSec).toBe(5);
      expect(clip.startSec).toBeGreaterThanOrEqual(0);
      expect(clip.startSec + clip.durationSec).toBeLessThanOrEqual(37.3);
    }
  });

  it("途中再生の開始位置は乱数で決まり、再現可能", () => {
    expect(computeClip(60, fromMiddle, mulberry32(5))).toEqual(
      computeClip(60, fromMiddle, mulberry32(5)),
    );
    expect(computeClip(60, fromMiddle, () => 0.5)).toEqual({ startSec: 27.5, durationSec: 5 });
  });

  it("短い音源ではクリップ長を音源の長さに縮める", () => {
    expect(computeClip(2, fromBeginning, rng)).toEqual({ startSec: 0, durationSec: 2 });
    expect(computeClip(4, fromMiddle, rng)).toEqual({ startSec: 0, durationSec: 4 });
    // 60秒未満の国歌は実際にあり得る
    expect(computeClip(45, DIFFICULTY_SETTINGS[1].clip, rng)).toEqual({
      startSec: 0,
      durationSec: 45,
    });
  });

  it("音源の長さが 0・負・非有限なら例外", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => computeClip(bad, fromBeginning, rng)).toThrow(RangeError);
    }
  });

  it("クリップ長の設定が 0・負なら例外", () => {
    for (const bad of [0, -1]) {
      expect(() => computeClip(60, { start: "beginning", durationSec: bad }, rng)).toThrow(
        RangeError,
      );
    }
  });
});
