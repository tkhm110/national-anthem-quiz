import { useEffect, useRef, useState } from "react";
import type { Clip } from "../lib/quiz";

type Status = "idle" | "loading" | "playing" | "paused" | "ended" | "blocked" | "error";

type Props = {
  src: string;
  clip: Clip;
};

const STATUS_MESSAGES: Partial<Record<Status, string>> = {
  loading: "読み込み中…",
  blocked: "ブラウザが再生を止めました。もう一度「再生」を押してください。",
  error: "音声を読み込めませんでした。通信状態を確認して、もう一度お試しください。",
};

/**
 * 出題区間（clip）だけを再生するプレーヤー。自動再生はせず、ユーザーの操作で再生する
 * （ブラウザの自動再生の制限に引っかからないようにするため）。
 * 問題が変わったら key を変えて作り直す前提。
 */
export function AudioPlayer({ src, clip }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const endSec = clip.startSec + clip.durationSec;

  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  async function play() {
    const audio = audioRef.current;
    if (!audio) return;
    // 読み込みに失敗した後は、要素がエラー状態のまま残るので読み込み直す（通信が戻ったときに復帰できるように）
    if (status === "error" || audio.error) audio.load();
    // 一時停止からの再開以外は、区間の先頭から再生する
    if (status !== "paused") {
      audio.currentTime = clip.startSec;
      setElapsed(0);
    }
    setStatus("loading");
    try {
      await audio.play();
      setStatus("playing");
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") setStatus("blocked");
      else if (error instanceof DOMException && error.name === "AbortError") setStatus("idle");
      else setStatus("error");
    }
  }

  function pause() {
    audioRef.current?.pause();
    setStatus("paused");
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setElapsed(Math.min(Math.max(audio.currentTime - clip.startSec, 0), clip.durationSec));
    if (audio.currentTime >= endSec) {
      audio.pause();
      setStatus("ended");
    }
  }

  const isPlaying = status === "playing" || status === "loading";
  const label =
    status === "paused"
      ? "再開"
      : status === "ended"
        ? "もう一度聴く"
        : status === "error"
          ? "もう一度試す"
          : "再生";
  const message = STATUS_MESSAGES[status];

  return (
    <div className="player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setStatus("ended")}
        onError={() => setStatus("error")}
      />
      <button
        type="button"
        className="button button-primary player-button"
        onClick={isPlaying ? pause : play}
      >
        {isPlaying ? "一時停止" : label}
      </button>
      <div className="player-progress">
        <progress value={elapsed} max={clip.durationSec} aria-label="再生位置" />
        <span className="player-time">
          {Math.floor(elapsed)} / {Math.round(clip.durationSec)} 秒
        </span>
      </div>
      <p className="player-message" role="status" aria-live="polite">
        {message ?? ""}
      </p>
    </div>
  );
}
