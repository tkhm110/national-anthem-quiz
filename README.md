# 国歌クイズ

国歌の器楽演奏を聴き、国名を4択で当てる日本語Webアプリ。静的サイトとして公開する予定。

**Phase 1〜2 が完了し、Phase 3（UI・音源・公開）を進めている。**
データ検証と出題エンジン（UI非依存）、テスト、GitHub Actions による CI、クイズの画面までを実装済み。

## セットアップ

必要なもの：Node.js 24（LTS。バージョンは [.node-version](.node-version) に書いてある）、pnpm 10。

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
  anthems/<id>.json        本番用の国データ（1国1ファイル。現在は8か国）
  melody-groups.json       本番用の同一・類似旋律グループ（現在は空配列）
public/
  audio/<id>.mp3           音源（権利を確認したものだけ。ビルド時にそのまま配信される）
scripts/
  validate-data.ts         pnpm validate:data の本体
  lib/read-data-dir.ts     Node(fs) でデータを読み込む（スクリプトとテストで共有）
src/
  lib/schema/              Zod スキーマと、z.infer で導出した型
  lib/data/validate.ts     検証の本体（スキーマ＋横断整合性）。読み込み方法に依存しない
  lib/data/bundled.ts      Vite の import.meta.glob で本番データを自動収集
  lib/random/              シード付き乱数（mulberry32）とシャッフル
  lib/quiz/                出題エンジン（条件フィルター・旋律クラス・クリップ・セッション生成）
  lib/game/                画面の状態遷移（モード選択 → プレイ中 → 結果）の reducer
  lib/audio/               音源の URL を作る（配信元の切り替えとパス走査の防止）
  components/              画面の部品（モード選択・クイズ・音声プレーヤー・結果・出典一覧）
  App.tsx, main.tsx        画面の切り替えと起動
  styles.css               スタイル（ダークモード対応）
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

1. **音源を選び、権利を確認する**（下の「音源の選び方」）。
2. 音源を `public/audio/<id>.mp3` に置く。
3. `data/anthems/<id>.json` を1つ作る（`<id>` は ISO 3166-1 alpha-2 の小文字。例：`jp.json`）。
   `audio.durationSec` には音源の実際の長さ（秒）を書く。
4. 聴き分けられない国・似ている国があれば `data/melody-groups.json` にグループを追加する。
5. `pnpm validate:data` と `pnpm test` を実行する。長さが0.5秒より大きくずれていると、`validate:data` がエラーで知らせる。

一覧ファイルの編集やコードの変更は不要（`import.meta.glob` で自動的に読み込まれる）。

### 音源の選び方

- 米海軍軍楽隊（United States Navy Band）の演奏を、[Wikimedia Commons](https://commons.wikimedia.org/) から使う。
- ファイルのページの「Licensing」で、次の2つがそろっていることを人が確認する。
  - **Performance（演奏）**：米海軍の職務上の著作物としてパブリックドメイン（`PD-USGov-Military-Navy` など）。出典が米海軍軍楽隊（navyband.navy.mil）の記録であること。
  - **Composition（楽曲）**：楽曲自体もパブリックドメイン（作曲者の没年が十分に古い、など）。最近作られた国歌は楽曲の著作権が残っていることがあるので注意する。
    **米国でもパブリックドメインである根拠**（`PD/1923`・`PD-old-auto-1923` のように「1929年より前に出版」を示す表示、`PD-1996` など）があることを確かめる。
    原産国で保護期間が切れているだけ（`PD-old-auto` だけ）では足りない。1996年の時点で原産国で保護されていた外国の作品は、米国で権利が回復している場合がある（URAA）。
- ページの**冒頭に削除依頼（Deletion request）などの警告が出ていない**ことを確かめる。Licensing の欄だけを見ると見落としやすい。
- 楽曲とは別に、**録音に使われた編曲**の権利が問題になることがある（作曲者ではなく、編曲者の没年で保護期間が決まる）。
- 元のファイルは Ogg 形式が多いが、Safari でも再生できるように、Commons が用意している **MP3 の変換版**（ファイルページの「Transcode status」や API の `derivatives`）を使う。
- `license` には、出典として Commons のファイルページの URL を書き、`note` に楽曲と演奏それぞれのパブリックドメインの根拠を書く。
- 米国政府の著作物がパブリックドメインなのは「米国では」とされている。他の国での扱いは厳密には国ごとに異なるが、このプロジェクトでは許容できるリスクと判断している。

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

| 層            | 内容                                                                                                              | 状態     |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| 1. スキーマ   | 型・必須項目・ID形式・ライセンス・音源ファイル名                                                                  | 実装済み |
| 2. 横断整合性 | ID重複、ファイル名とIDの一致、音源ファイル名の重複、旋律グループの参照先・重複・メンバー数、本番への fixture 混入 | 実装済み |
| 3. 音源       | 音源ファイルがあるか、読み取れるか、実際の長さと `durationSec` の差が0.5秒以内か。使われていない音源の警告        | 実装済み |

第3層は Node だけで動く（[scripts/lib/check-audio.ts](scripts/lib/check-audio.ts)）。音源の長さは `music-metadata` で読み取る。
本番データが0件のとき、`pnpm validate:data` は `[WARN]` を表示して終了コード 0 で終わる。
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

## 画面の動き

- **モード選択**：地域 × 難易度の28通りを表で示し、それぞれの問題数を表示する。4択を作れない組み合わせは「—」で、選ぶと理由を表示し、スタートできない。
- **プレイ中**：「問題 1 / 7」のように進み具合を示す。地域・難易度・問題列は開始時に固定され、途中では変えられない。
  - 音声は**自動再生しない**。「再生」を押すと出題区間（冒頭から最大60秒）を流す。ブラウザが再生を拒否したとき（`NotAllowedError`）と、読み込みに失敗したときは、それぞれ案内を表示する。
  - 4つの選択肢から1つ選ぶと、正解・不正解と、正解の国名・曲名を表示する。1問に答えられるのは1回だけ。
  - 「終了」を押すと、「進行状況は破棄されます」と確認してからモード選択に戻る。
  - プレイ中にページを閉じる・再読み込みしようとすると、ブラウザの確認を出す。**進行状況は保存しない**（再読み込みすると最初から）。
- **結果**：正答数と各問題の正誤を表示し、「同じモードでもう一度」か「モード選択へ戻る」を選べる。
- **出典**：画面の下に、音源の出典とライセンスの一覧を、国データから自動で表示する。

状態遷移のルールは [src/lib/game/index.ts](src/lib/game/index.ts) の reducer にまとめ、React の部品からは切り離している（テストは `tests/game.test.ts`）。

## テスト

`pnpm test` で実行する。主な内容：

- **データ検証**（`data-validation.test.ts`）：正しいデータは受理し、不正な fixture と多数の形式違反を拒否する。
  横断整合性のエラーの検出、fixture が本番データに混入していないことも確認する。
- **旋律・乱数・クリップ**（`melody-random-clip.test.ts`）：`identical` の推移閉包、`similar` が推移しないこと、
  乱数の再現性、再生区間が音源内に収まること（短い音源も含む）。
- **セッション生成**（`session.test.ts`）：28モードすべて × 30シードで不変条件を検査する。
  さらに、代表的なモードの出題数、超級の類似優先、境界条件（0・3・4・10・11か国、同一旋律ばかり、他地域へ広げないこと）、
  `maxQuestions` の扱い、決定性を確認する。
- **画面の状態遷移・音源の URL**（`game.test.ts`）：開始後に条件が変わらないこと、1問1回答、未回答で進めないこと、
  途中終了・再挑戦、`generateSession` の問題列で最後まで遊べること、不正な音源ファイル名を拒否すること。
- 画面そのもの（ボタンの操作や音声の再生）のテストは、Phase 4 で Playwright を使って行う。
  そのときに、音声の読み込みに失敗した後、通信が戻ってから「もう一度試す」で再生できること（Phase 3 のレビューで見つかった不具合）も回帰テストにする。

fixture はおおまかな仕様の確認に使い、件数の境界条件はテスト内で架空国を必要な数だけ作って確認している（`makeAnthem`）。
こうすると、境界ごとに fixture ファイルを増やさずに済む。

## CI（GitHub Actions）

[.github/workflows/ci.yml](.github/workflows/ci.yml) で、PR の作成・更新時と main への push 時に次を順に実行する。
どれか1つでも失敗すると CI 全体が失敗になる。

`pnpm install --frozen-lockfile` → `lint` → `format:check` → `typecheck` → `validate:data` → `test` → `build`

- `--frozen-lockfile`：`pnpm-lock.yaml` と `package.json` が食い違っていたら失敗させる（手元と同じ依存関係で検証するため）。
- 権限は `contents: read` だけにしている。
- 使うアクションはタグではなくコミット SHA で固定している。タグは後から別のコミットに付け替えられるため。
- Node のバージョンは `.node-version` で一元管理し、CI もこのファイルを読む（`node-version-file`）。Node を上げるときは、このファイルと `package.json` の `engines`・`@types/node` を一緒に変更する。
- main は Rulesets で保護している。直接の push・force push・削除は禁止で、`check` ジョブが成功した PR だけをマージできる。

### 依存関係の自動更新（Dependabot）

[.github/dependabot.yml](.github/dependabot.yml) で、毎週月曜に npm パッケージと GitHub Actions の更新 PR を作らせる。

- minor・patch の更新は1つの PR にまとめる。CI が通れば、内容を確認してマージする。
- 公開されてから7日未満の版は提案させない（`cooldown`）。乗っ取られたパッケージをすぐ取り込まないため。
- メジャー更新はまとめず、パッケージごとに別の PR になる。問題が起きたときに原因を切り分けやすくするため。
- `@types/node` だけはメジャー更新を提案させない。型定義を、実際に使う Node のメジャー版（`.node-version`）に合わせるため。
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

**PR の確認**：`pnpm pr:status [PR番号]` で、CI・Codex のレビュー・指摘・手元とのずれをまとめて表示する（読み取りだけ）。
Claude Code では `/pr-check [PR番号]` で、この結果をもとに指摘の確認と「採用／不採用／要相談」の判断、マージしてよいかの判断まで行う（[.claude/skills/pr-check/SKILL.md](.claude/skills/pr-check/SKILL.md)）。

## 技術選定の理由

- **Vite + React + TypeScript（strict）**：静的サイトの標準的な構成。`noUncheckedIndexedAccess` も有効にし、配列の範囲外アクセスを型で見つけやすくしている。
- **Vite 6**：最初に開発した環境が Node 20.12 で、Vite 7 以降が動かなかったため。Node 24 に上げたので、今後のメジャー更新で新しい版に移る。
- **Zod 4**：JSON の実行時検証と TypeScript の型を1か所で定義できる（`z.infer`）。
- **Vitest**：Vite と設定を共有でき、TypeScript をそのまま実行できる。
- **music-metadata**：`validate:data` の第3層で、音源の実際の長さを読み取るために使う（開発時のみ。サイトには含まれない）。
- **tsx**：`validate:data` の実行に使う。Node 24 は型を取り除くだけなら TypeScript を直接実行できるが、import に拡張子を書かない今のコードの書き方には対応していないため。
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
7. **音源**：米海軍軍楽隊の演奏（Wikimedia Commons の MP3 変換版）を採用した。最初の8か国は、楽曲が十分に古い国から選んだ（イギリス・フランス・ドイツ・イタリア・オランダ・日本・インド・アメリカ合衆国）。
   中国とタイは候補にしたが、権利を確認しきれないため収録を見送った（Codex のレビューで判明）。中国の録音は、使われている吹奏楽への編曲の著作権を理由に Commons で削除依頼が出ている（2026年9月）。
   タイは、楽曲が米国でパブリックドメインである根拠がない（URAA により米国では2027年末まで保護される可能性がある）。アジアのモードは、アジアの国が4か国以上そろうまで遊べない。
   各国の難易度は仮の値で、国が増えてから見直す。米国政府の著作物の米国外での扱いは、上の「音源の選び方」のとおり許容できるリスクとしている。
8. **データが0件の `validate:data`**：警告を出して成功で終わる。公開前に「0件なら失敗」にするオプションを追加するか検討する。
9. 設計書の第14章に挙げた項目（難易度の付け方、旋律判定の厳密さ、対象国の定義、得点方式、状態保存、音源の配信と権利、CI/CDの権限）。

## ライセンス

このリポジトリの**コード**は [MIT License](LICENSE) で公開する。

音源ファイルと、国データに記載する録音の出典・権利情報は、MIT License の対象外とする。
それぞれの音源には、国データの `license` に書かれた元のライセンスと帰属表示の条件が適用される。
