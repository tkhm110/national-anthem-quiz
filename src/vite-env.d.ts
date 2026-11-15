/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 音源の配信元（例：R2 の URL）。未設定なら public/audio/ を使う */
  readonly VITE_AUDIO_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** 全曲入りの非公開版の国データ（scripts/lib/local-anthems.ts のプラグインが作る）。公開版では常に空 */
declare module "virtual:local-anthems" {
  const files: { fileName: string; content: unknown }[];
  export default files;
}
