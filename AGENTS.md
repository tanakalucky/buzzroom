# 共通の作業指示

不明点は既存の会話・資料・コードで先に確認し、明示済みの内容は聞き直さない。
ユーザー判断が必要な点だけ質問し、回答に依存する作業は待つ。
質問時は[認識合わせの共通手順](.ai-config/workflows/clarify.md)を全文読んで適用する。

Codexのレビュー担当（親・子）は、規約・skillを読む最初の操作からshellをGit読取に限定する。
初期読込も例外にせず、次の順序で読む。パスはこのファイルと同じルートを基準にする。

1. `git ls-files --cached --others --exclude-standard -- <読む文書の明示パス>...` で対象名を確認し、機密・ignoredを除く。
2. 確認できた文書の現在本文を専用の読取ツールで読む。専用ツールがなければ、各文書を `git diff --no-index -- /dev/null <path>` で全文取得する（差分ありの終了コード1は正常）。まず下記コーディング規約と[Codexの実行条件](.agents/review-runtime.md)、続いて指定skillとその参照先を読む。

初期読込に`cat`・`rg`・`pwd`を使わず、`git show HEAD:<path>`で現在本文を置き換えない。
必要な文書や読取手段が不足する場合は迂回せず、未完了と報告する。
親・子とも読取専用を守り、既存のsandbox・認証・承認設定を変更しない。
運用指示は技術的な拒否の保証ではない。実効条件の未確認だけを理由に開始を中止せず、確認済みと未確認を分けて報告する。

作業開始時に、このファイルと同じルートにある
[コーディング規約](.ai-config/rules/coding.md)を全文読んで適用する。
ドキュメントの作成・更新では[記載方針](.ai-config/rules/documentation.md)も全文読んで適用する。
PR作成前にも同じ記載方針を全文読んで適用する。
Markdownリンクの自動展開を前提にせず、明示的に読む。見つからなければ不足を報告する。

実装前の認識合わせにはClaude Codeの`/clarify`、Codexの`$clarify`を使う。
レビューを依頼された場合はClaude Codeの`/ai-dev-config-review`、Codexの`$ai-dev-config-review`を使う。
いずれも各ツールの入口から`.ai-config/`の共通手順を読む。

1つのIssueは両ツールの`development-orchestrator`から[共通手順](.ai-config/workflows/development-orchestrator.md)を全文読む。
Coordinator（コーディネーター）はAIでも人間でも担える人間の代役で、日次のIssue確認・整理とIssue担当への依頼、週次repo担当への依頼を担う。
依頼受理後の進行・品質・停止再開・重複防止はrepo側で完結させる。
[役割と受け渡し](.ai-config/workflows/agent-handoff.md)を全文読み、最上位セッションから専門agentへ委譲する。
週次候補は同名の`weekly-discovery`から[課題発見手順](.ai-config/workflows/weekly-discovery.md)、
運用改善は同名の`development-improvement`から[振返り・効果確認](.ai-config/workflows/development-improvement.md)を全文読む。
外部実行や既存設定の変更は、対象と本人の許可を確認する。この記載だけで外部設定・スケジュールを有効化しない。

フロントエンドの新規作成・変更では[FSDルール](.ai-config/rules/fsd.md)を全文読む。
Claude Codeの`/fsd`、Codexの`$fsd`から導入・変更の共通手順を使う。

Cloudflareの導入・変更では[デプロイ運用ルール](.ai-config/rules/cloudflare-deploy.md)を全文読む。
Claude Codeの`/cloudflare-deploy`、Codexの`$cloudflare-deploy`から共通手順を使う。

レビューと修正は[ラウンドの共通定義](.ai-config/review/rounds.md)を読んで進める。
実装後のPR作成とレビュー記録は[PRへの記録手順](.ai-config/review/records.md)を全文読んで適用する。
独立3観点の依頼・統合は[レビュー手順](.ai-config/review/workflow.md)に従う。
レビュー担当は報告のみ。修正・回数管理は実装担当が行い、自己レビューで独立レビューを代用しない。
入口・委譲機能が使えない場合や観点の未完了は、未完了と報告する。

# Buzzroom 固有ルール

このリポジトリで作業するエージェント向けのローカルルール。共通本文に加えて適用する。

## 言語

ユーザーとのやり取り・コミットメッセージ・ドキュメントは日本語で書く。

## 仕様とドキュメント

- 機能の境界と要求仕様は [docs/requirements.md](docs/requirements.md) と `docs/features/*.md`(room・buzzer・score)が正本。実装前に該当する doc を確認する。
- 進め方の区切りと進捗は [docs/plan.md](docs/plan.md) を参照する。
- 挙動・仕様を変える変更は、同じ PR で対応する doc(`docs/requirements.md` / `docs/features/*.md` / `docs/plan.md`)も更新する。doc だけを直す変更(typo 修正等)はこの逆を要求しない。

## npm コマンド

`package.json` の `scripts` が正本。

| コマンド            | 用途                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`       | ローカル開発サーバの起動                                                                                                                     |
| `npm run build`     | Cloudflare Worker 向け build                                                                                                                 |
| `npm run start`     | build 済み Worker のローカル preview                                                                                                         |
| `npm run deploy`    | Cloudflare Worker への deploy                                                                                                                |
| `npm run typegen`   | Cloudflare Worker の Env/binding 型(`cf workers types`)と App Router のルート補助型(`vinext typegen`)を生成                                  |
| `npm run typecheck` | `tsc --noEmit` による型チェック                                                                                                              |
| `npm run lint`      | oxlint によるチェック                                                                                                                        |
| `npm run fmt:check` | oxfmt によるフォーマット確認                                                                                                                 |
| `npm run format`    | oxfmt によるフォーマット適用                                                                                                                 |
| `npm test`          | ルール・セッションの単体テスト、build済みRoomDOの実通信・保存復元テスト、生成フォームとHTTP応答のスモークテスト(先に `npm run build` が必要) |

## main・リリース

- `main` ブランチへの直接の変更はしない。変更は PR 経由で行う。
- このエージェントが PR の merge・deploy を実行することはない(承認・実行はユーザー/コーディネーターが行う)。

## レビューの前提

`/ai-dev-config-review` / `$ai-dev-config-review` とそこから呼ばれる `review-correctness` / `review-design` / `review-tests` skill を使うレビューは、このリポジトリでは次を前提にする。

- `review-correctness`: 実装と `docs/requirements.md` / `docs/features/*.md` の内容が矛盾していないか、挙動・仕様を変えた変更で対応する doc の更新が漏れていないかを確認する。
- `review-design`: コードおよび doc の明確さ・構成の重複を確認する。
- doc のみの変更は、それだけを理由に対応するコードのテストを機械的に要求しない(doc とコードの不整合チェックは `review-correctness` が行う)。

## 既存の配備境界

- Cloudflare の設定は `cloudflare.config.ts`、CLI とコマンドは `package.json` と lockfile が正本。既存の Worker Preview・Access 保護・本番 job を維持する。
- Preview の owner 限定 build/deploy 同一 job は既存の受入済み信頼モデル。共通ルールの導入だけで隔離済みとは扱わず、権限・認証・セキュリティ機構の変更は別途本人へ確認する。
- QA は Preview 限定。本番で `/__qa` や `qa:probe` を有効にしない。認証 Cookie・token を抽出・転送せず、Access の迂回をしない。
- CI・Preview・手動 E2E の証拠と接続契約は [開発ループ](docs/development-loop.md) に従う。一般の merge/deploy は上記既定を守り、対象と条件を特定した現在の本人の明示許可がある場合だけ Coordinator が判断する。
