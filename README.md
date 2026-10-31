# 国歌クイズ

国歌の器楽演奏を聴き、国名を4択で当てる日本語Webアプリ。静的サイトとして公開する予定。

**Phase 1〜2 が完了。** データ検証と出題エンジン（UI非依存）、テスト、GitHub Actions による CI までを実装済み。
画面は「28モードの出題可能数」を表示する仮のものだけで、音源・クイズ画面はまだない。

## セットアップ

必要なもの：Node.js 20.12 以上（推奨は現行のLTS）、pnpm 10。

```bash
# pnpm が未インストールの場合（どちらか一方）
corepack enable pnpm     # Node 同梱の Corepack を使う（管理者権限が必要な場合あり）
npm install -g pnpm@10   # npm でグローバルに入れる

pnpm install
```

`package.json` の `packageManager` で pnpm のバージョンを固定している。

## 主要コマンド

| コマンド             | 内容                                               |
| -------------------- | -------------------------------------------------- |
| `pnpm dev`           | 開発サーバーを起動                                 |
| `pnpm lint`          | ESLint                                             |
| `pnpm format`        | Prettier で整形（`format:check` は確認のみ）       |
| `pnpm typecheck`     | TypeScript の型チェック（アプリ用・Node用の2設定） |
| `pnpm validate:data` | 本番データ（`data/`）の検証。失敗時は終了コード 1  |
| `pnpm test`          | Vitest でテストを実行（`test:watch` で監視モード） |
| `pnpm build`         | 型チェック後に本番ビルド（`dist/`）                |

## ディレクトリ構成

```text
data/
  anthems/<id>.json        本番用の国データ（1国1ファイル。現在は0件）
  melody-groups.json       本番用の同一・類似旋律グループ（現在は空配列）
scripts/
  validate-data.ts         pnpm validate:data の本体
  lib/read-data-dir.ts     Node(fs) でデータを読み込む（スクリプトとテストで共有）
src/
  lib/schema/              Zod スキーマと、z.infer で導出した型
  lib/data/validate.ts     検証の本体（スキーマ＋横断整合性）。読み込み方法に依存しない
  lib/data/bundled.ts      Vite の import.meta.glob で本番データを自動収集
  lib/random/              シード付き乱数（mulberry32）とシャッフル
  lib/quiz/                出題エンジン（条件フィルター・旋律クラス・クリップ・セッション生成）
  App.tsx, main.tsx        仮画面
tests/
  fixtures/anthems/        テスト用の架空国（18件）
  fixtures/melody-groups.json
  fixtures/invalid/        わざと壊したJSON（検証エラーのテスト用）
  helpers.ts               fixture 読み込み・架空国の生成・セッションの不変条件チェック
  *.test.ts
```

**分け方の理由**：出題ロジックと検証ロジックは React・Vite・Node のどれにも依存しない純粋な TypeScript にし、
ファイルの読み込みだけを環境ごとに分けた（Vite は `bundled.ts`、Node は `read-data-dir.ts`）。
こうするとアプリと `validate:data` で同じ検証を使え、テストもブラウザなしで高速に実行できる。

## 国データの追加手順

1. `data/anthems/<id>.json` を1つ作る（`<id>` は ISO 3166-1 alpha-2 の小文字。例：`jp.json`）。
2. 音源を `public/audio/` に置く（Phase 3 以降。権利を確認したものだけ）。
3. 聴き分けられない国・似ている国があれば `data/melody-groups.json` にグループを追加する。
4. `pnpm validate:data` と `pnpm test` を実行する。

一覧ファイルの編集やコードの変更は不要（`import.meta.glob` で自動的に読み込まれる）。

```json
{
  "id": "jp",
  "nameJa": "日本",
  "nameEn": "Japan",
  "anthemTitle": { "original": "君が代", "ja": "君が代" },
  "region": "asia",
  "difficulty": 1,
  "audio": { "file": "jp.mp3", "durationSec": 62.5 },
  "composer": "（任意）",
  "adoptedYear": 1999,
  "license": {
    "type": "public-domain",
    "author": "（演奏者・録音者）",
    "sourceUrl": "https://（実際の出典URL）"
  }
}
```

### 項目と命名規則

- `id`：小文字2文字。ファイル名は必ず `<id>.json`。
- `region`：`asia` / `europe` / `africa` / `north-america` / `south-america` / `oceania`。
  - 中東はアジアに含める。中米・カリブは北アメリカに含める。
  - 「全世界」はクイズ条件の特別値なので、国データには書かない。
- `difficulty`：その国が出題され始める最低の難易度（1=初級 〜 4=超級）。
- `audio.file`：ディレクトリを含まないファイル名（拡張子込み、`.mp3` か `.ogg`）。英小文字・数字・`.` `_` `-` のみ使え、`..` は禁止。
- 定義されていない項目（タイプミスなど）はエラーになる。

### 旋律グループ（`melody-groups.json`）

```json
[
  {
    "id": "god-save-the-king",
    "relationType": "identical",
    "countryIds": ["gb", "li"],
    "description": "旋律を共有。採用した録音とクリップで確認済み"
  }
]
```

- `identical`：聴き分けられない。同じ4択には並べない。A=B かつ B=C なら A=C とみなす。
- `similar`：似ているが聴き分けられる。超級で誤答として優先する。直接同じグループにいる組だけが対象。
- グループが参照する国は `data/anthems/` に存在する必要がある。国データがない間は空配列 `[]` のままにする。

### ダミーデータと本番データの区別

- テスト用の架空国は `tests/fixtures/` にだけ置き、ISO でどの国にも割り当てられない
  ID（`aa`、`qm`〜`qz`、`xa`〜`xz`、`zz`）を使う。`xk` はコソボで事実上使われているので予約IDから外している。
- 本番データの検証では、予約IDと `example.com` などのダミーURLをエラーにする。
  fixture を誤って `data/` にコピーしても、`validate:data` が失敗する。
- **Zod の検証に通っても、法的に利用できることの確認にはならない。** 出典と許諾は人が確認する。

## データ検証の仕組み

| 層            | 内容                                                                                                              | 状態                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1. スキーマ   | 型・必須項目・ID形式・ライセンス・音源ファイル名                                                                  | 実装済み               |
| 2. 横断整合性 | ID重複、ファイル名とIDの一致、音源ファイル名の重複、旋律グループの参照先・重複・メンバー数、本番への fixture 混入 | 実装済み               |
| 3. 音源       | 音源ファイルの実在・形式・長さ                                                                                    | 音源導入フェーズで追加 |

本番データが0件のとき、`pnpm validate:data` は `[WARN]` を表示して終了コード 0 で終わる（Phase 1 の想定どおりの状態）。
データがあるときは、28モードそれぞれの出題可能数を一覧表示する。

## 出題ルール

- 正解も誤答も、選んだ地域・難易度に合う国からだけ選ぶ。足りなくても、他の地域や上の難易度の国では補わない。
- 難易度は累積方式：初級は難易度1、中級は1〜2、上級は1〜3、超級は1〜4の国が対象。
- 4つの選択肢のどの2か国も、同じ `identical` クラスに属さない。
- 1プレイは最大10問。成立する問題が10問未満ならその数だけ出し、0問なら開始できない（`INSUFFICIENT_POOL`）。
- 正解国は1プレイ内で重複しない（誤答としての再登場は許可）。
- 超級だけ、正解と `similar` の関係にある国を先に誤答に入れる。足りない分は同じ条件の他の国で補う。
- 再生区間（暫定）：**全難易度で冒頭から60秒**。イントロで最初の数秒に何も流れない音源があり得るため。
  音源が60秒より短ければ、音源全体を再生する。難易度による違いは、出題対象の国と（超級の）誤答の選び方だけになる。
  設定は [src/lib/quiz/config.ts](src/lib/quiz/config.ts) にまとめてある。途中から再生する機能（`start: "random"`）は残してあり、設定を変えるだけで使える。
- 乱数は引数で渡す（`rng`）。同じデータ・条件・シードなら同じ問題列になる。入力データの並び順にも左右されない。

```ts
import { generateSession } from "./src/lib/quiz";
import { mulberry32 } from "./src/lib/random";

const result = generateSession(anthems, melodyGroups, {
  region: "europe",
  difficulty: 2,
  rng: mulberry32(42), // 本番では Math.random を渡してよい
});
if (result.ok) console.log(`1 / ${result.totalQuestions}`);
```

出題可能数の表示には `countAvailableQuestions` を使う。`generateSession` と同じ判定なので、表示される問題数と実際の問題数は必ず一致する。

## テスト

`pnpm test` で実行する。主な内容：

- **データ検証**（`data-validation.test.ts`）：正しいデータは受理し、不正な fixture と多数の形式違反を拒否する。
  横断整合性のエラーの検出、fixture が本番データに混入していないことも確認する。
- **旋律・乱数・クリップ**（`melody-random-clip.test.ts`）：`identical` の推移閉包、`similar` が推移しないこと、
  乱数の再現性、再生区間が音源内に収まること（短い音源も含む）。
- **セッション生成**（`session.test.ts`）：28モードすべて × 30シードで不変条件を検査する。
  さらに、代表的なモードの出題数、超級の類似優先、境界条件（0・3・4・10・11か国、同一旋律ばかり、他地域へ広げないこと）、
  `maxQuestions` の扱い、決定性を確認する。

fixture はおおまかな仕様の確認に使い、件数の境界条件はテスト内で架空国を必要な数だけ作って確認している（`makeAnthem`）。
こうすると、境界ごとに fixture ファイルを増やさずに済む。

## CI（GitHub Actions）

[.github/workflows/ci.yml](.github/workflows/ci.yml) で、PR の作成・更新時と main への push 時に次を順に実行する。
どれか1つでも失敗すると CI 全体が失敗になる。

`pnpm install --frozen-lockfile` → `lint` → `format:check` → `typecheck` → `validate:data` → `test` → `build`

- `--frozen-lockfile`：`pnpm-lock.yaml` と `package.json` が食い違っていたら失敗させる（手元と同じ依存関係で検証するため）。
- 権限は `contents: read` だけにしている。
- 使うアクションはタグではなくコミット SHA で固定している。タグは後から別のコミットに付け替えられるため。
- Node のバージョンは手元の環境（20）に合わせている。Node を上げるときは `ci.yml` も一緒に変更する。
- main は Rulesets で保護している。直接の push・force push・削除は禁止で、`check` ジョブが成功した PR だけをマージできる。

### 依存関係の自動更新（Dependabot）

[.github/dependabot.yml](.github/dependabot.yml) で、毎週月曜に npm パッケージと GitHub Actions の更新 PR を作らせる。

- minor・patch の更新は1つの PR にまとめる。CI が通れば、内容を確認してマージする。
- 公開されてから7日未満の版は提案させない（`cooldown`）。乗っ取られたパッケージをすぐ取り込まないため。
- **メジャー更新は当面提案させない。** Node 20 では Vite 7 以降などが動かないため。Node を上げるときにこの設定を外し、まとめて更新する。
- 脆弱性の修正（セキュリティ更新）はこの設定とは別の仕組みなので、メジャー更新でも PR が作られる。

## 開発の進め方（AI エージェントとの分担）

| ファイル                                                             | 内容                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                               | すべての AI エージェントが守る共通のルール（Codex は自動で読む） |
| [CLAUDE.md](CLAUDE.md)                                               | Claude Code（実装担当）固有の進め方。AGENTS.md を読み込む        |
| [REVIEW.md](REVIEW.md)                                               | リスクに応じたレビューの観点と、AI にレビューを頼む手順          |
| [.github/pull_request_template.md](.github/pull_request_template.md) | PR の本文の形式（検証結果と AI レビューの記録）                  |

| 担当                         | 役割                                   |
| ---------------------------- | -------------------------------------- |
| Claude Code                  | 実装・テスト・文書の更新               |
| Antigravity CLI（Gemini）    | push 前の事前レビュー（手元）          |
| Codex                        | GitHub 上の PR レビュー                |
| GitHub Actions（CI `check`） | 自動テストと品質ゲート（マージの条件） |

どの AI レビューをいつ使うかは、変更のリスクに応じて [REVIEW.md](REVIEW.md) で決めている。AI のレビューは助言で、マージの必須条件は CI の `check` だけ。

## 技術選定の理由

- **Vite + React + TypeScript（strict）**：静的サイトの標準的な構成。`noUncheckedIndexedAccess` も有効にし、配列の範囲外アクセスを型で見つけやすくしている。
- **Vite 6**：現在の環境の Node 20.12 では Vite 7 以降が動かないため。Node を上げたら更新を検討する。
- **Zod 4**：JSON の実行時検証と TypeScript の型を1か所で定義できる（`z.infer`）。
- **Vitest**：Vite と設定を共有でき、TypeScript をそのまま実行できる。
- **tsx**：Node 20 では TypeScript を直接実行できないため、`validate:data` の実行に使う。
- **ESLint + Prettier**：Lint と整形を分けて担当させる標準的な組み合わせ。

## 今後のフェーズ

| フェーズ | 内容                                                                   |
| -------- | ---------------------------------------------------------------------- |
| 2        | GitHub リポジトリ、PR 運用、GitHub Actions CI、ブランチ保護（完了）    |
| 3        | 最小限のUI（状態遷移を含む）、権利確認済みの音源、Cloudflare Pages、CD |
| 4        | Playwright E2E、PRプレビュー検証                                       |
| 5        | Sentry、Web Analytics、ライセンス一覧ページ、対象国の拡充              |

## 未決事項（Phase 1 で仮に決めたものを含む）

1. **`maxQuestions` が範囲外の場合**：10 に丸めずに `RangeError` で拒否する（1〜10 の整数のみ許可）。
   出題不足（`INSUFFICIENT_POOL`）は利用者に見せる結果なので戻り値で返し、引数の誤りはプログラムの誤りなので例外にした。
2. **出題できるかどうかの性質**：誤答は同じ条件の国から選ぶので、「その条件に同一旋律クラスが4つ以上あるか」だけで決まる。
   そのため出題できる国は「条件に合う全員」か「0件」のどちらかになる。将来、誤答の選び方を変えた場合は見直す。
3. **抽選の偏り**：誤答は国単位で一様に抽選しているので、国の多い同一旋律クラスはわずかに選ばれやすい。重み付き抽選と合わせて検討する。
4. **音源ファイル名の重複**：2か国が同じ音源ファイルを指すとエラーにしている（同じ曲でも録音は国ごとに持つ前提）。
5. **`identical` と `similar` の両方に入っている組**：検証ではエラーにせず、`identical`（同じ4択に並べない）を優先する。
6. **再生区間**：当面は全難易度で冒頭から60秒。難易度ごとに短くするか、イントロを飛ばす開始位置（`playableRanges` など）を国データに持たせるかは、音源を揃えてから判断する。
   途中から再生する場合の開始位置は、0.01秒単位に切り捨てている。
7. **音源の候補**：米海軍軍楽隊（United States Navy Band）の演奏を採用する方針。米国政府職員の職務上の著作物は米国では著作権の対象外とされるが、
   公開前に各ファイルの出所・ライセンス表示・帰属表示の条件を個別に確認する（楽曲自体の権利も別に確認する）。
8. **データが0件の `validate:data`**：警告を出して成功で終わる。公開前に「0件なら失敗」にするオプションを追加するか検討する。
9. 設計書の第14章に挙げた項目（難易度の付け方、旋律判定の厳密さ、対象国の定義、得点方式、状態保存、音源の配信と権利、CI/CDの権限）。
