import { describe, expect, it } from "vitest";
import { mulberry32, randomInt, shuffle } from "../src/lib/random";
import { buildMelodyRelations, computeClip, DIFFICULTY_SETTINGS } from "../src/lib/quiz";
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

  it("初級・中級は冒頭から 15秒・10秒", () => {
    expect(computeClip(60, DIFFICULTY_SETTINGS[1].clip, rng)).toEqual({
      startSec: 0,
      durationSec: 15,
    });
    expect(computeClip(60, DIFFICULTY_SETTINGS[2].clip, rng)).toEqual({
      startSec: 0,
      durationSec: 10,
    });
  });

  it("上級・超級は途中から 5秒・3秒で、音源の末尾を超えない", () => {
    for (const difficulty of [3, 4] as const) {
      const setting = DIFFICULTY_SETTINGS[difficulty].clip;
      for (const value of [0, 0.5, 0.999999]) {
        const clip = computeClip(37.3, setting, () => value);
        expect(clip.durationSec).toBe(setting.durationSec);
        expect(clip.startSec).toBeGreaterThanOrEqual(0);
        expect(clip.startSec + clip.durationSec).toBeLessThanOrEqual(37.3);
      }
    }
  });

  it("途中再生の開始位置は乱数で決まり、再現可能", () => {
    const setting = DIFFICULTY_SETTINGS[3].clip;
    expect(computeClip(60, setting, mulberry32(5))).toEqual(
      computeClip(60, setting, mulberry32(5)),
    );
    expect(computeClip(60, setting, () => 0.5)).toEqual({ startSec: 27.5, durationSec: 5 });
  });

  it("短い音源ではクリップ長を音源の長さに縮める", () => {
    expect(computeClip(2, DIFFICULTY_SETTINGS[1].clip, rng)).toEqual({
      startSec: 0,
      durationSec: 2,
    });
    expect(computeClip(4, DIFFICULTY_SETTINGS[3].clip, rng)).toEqual({
      startSec: 0,
      durationSec: 4,
    });
    expect(computeClip(3, DIFFICULTY_SETTINGS[4].clip, rng)).toEqual({
      startSec: 0,
      durationSec: 3,
    });
  });

  it("音源の長さが 0・負・非有限なら例外", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => computeClip(bad, DIFFICULTY_SETTINGS[1].clip, rng)).toThrow(RangeError);
    }
  });
});
