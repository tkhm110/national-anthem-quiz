/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 音源の配信元（例：R2 の URL）。未設定なら public/audio/ を使う */
  readonly VITE_AUDIO_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
