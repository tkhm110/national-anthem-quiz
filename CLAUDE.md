# CLAUDE.md

共通ルールは AGENTS.md にある（下の行で読み込む）。このファイルには Claude Code 固有の内容だけを書く。

@AGENTS.md

## Claude Code の役割：実装担当

- 実装・テスト・文書の更新は Claude Code が行う。レビューは Antigravity CLI（push 前・手元）と Codex（GitHub 上の PR）が [REVIEW.md](REVIEW.md) に沿って行う。
- 中・高リスクの変更をコミットしたら、push の前に Antigravity CLI で事前レビューするようユーザーに伝える（REVIEW.md の「4.1」）。
- 他のエージェントの指摘を受け取ったら、1件ずつ「採用（修正する）／不採用（理由）／要相談」に分けて答える。
  自分の実装を守る方向に偏らないよう、判断が分かれるものは「要相談」としてユーザーに委ねる。

## 作業の進め方

1. ブランチを作る（`feat/`・`fix/`・`chore/`・`docs/` など）。
2. 変更したら、AGENTS.md の6つのコマンドをすべて実行して通す。
3. コミットする。コミットメッセージはファイルに書いて `git commit -F <ファイル>` で渡す
   （PowerShell から複数行のメッセージを直接渡すと失敗するため）。
4. push・PR の作成・マージはユーザーが行う。PR の本文の案を `.github/pull_request_template.md` の形式で示す。

- `git add -A` を使う前に `git status` で、意図しないファイル（ローカルの設計書など）が含まれていないか確認する。
- コマンドを実行してもらう必要があるときは、何をなぜ実行するかを説明する。
