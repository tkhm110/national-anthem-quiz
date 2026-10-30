import type { Rng } from "../random";
import type { ClipSetting } from "./config";

export type Clip = { startSec: number; durationSec: number };

/**
 * 再生区間を計算する。必ず次を満たす:
 *   startSec >= 0, durationSec > 0, startSec + durationSec <= audioDurationSec
 * 音源が設定より短い場合は、音源全体（冒頭から）を再生する長さに縮める。
 * 途中再生の開始位置は 0.01 秒単位に切り捨て、浮動小数の誤差で末尾を超えないようにする。
 */
export function computeClip(audioDurationSec: number, setting: ClipSetting, rng: Rng): Clip {
  if (!Number.isFinite(audioDurationSec) || audioDurationSec <= 0) {
    throw new RangeError(`音源の長さが不正です: ${audioDurationSec}`);
  }
  if (!Number.isFinite(setting.durationSec) || setting.durationSec <= 0) {
    throw new RangeError(`クリップの長さの設定が不正です: ${setting.durationSec}`);
  }

  const durationSec = Math.min(setting.durationSec, audioDurationSec);
  if (setting.start === "beginning") return { startSec: 0, durationSec };

  const latestStart = audioDurationSec - durationSec;
  const startSec = Math.floor(rng() * latestStart * 100) / 100;
  return { startSec: Math.min(Math.max(startSec, 0), latestStart), durationSec };
}
