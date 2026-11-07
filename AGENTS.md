# 共通の作業指示

不明点はまず既存の会話・資料・コードで確認し、明示済みの内容を聞き直さない。
ユーザーの判断が必要な不明点は推測で補わず、必ず質問する。回答を得て認識が揃うまで、その判断に依存する作業は進めない。
質問時は[認識合わせの共通手順](.ai-config/workflows/clarify.md)を全文読んで適用する。

Codexのレビュー担当（親・子）は、規約・skillを読む最初の操作からshellをGit読取に限定する。
初期読込も例外にせず、次の順序で読む。パスはこのファイルと同じルートを基準にする。

1. `git ls-files --cached --others --exclude-standard -- <読む文書の明示パス>...` で対象名を確認し、機密・ignoredを除く。
2. 確認できた文書の現在本文を専用の読取ツールで読む。専用ツールがなければ、各文書を `git diff --no-index -- /dev/null <path>` で全文取得する（差分ありの終了コード1は正常）。まず下記コーディング規約と[Codexの実行条件](.agents/review-runtime.md)、続いて指定skillとその参照先を読む。

初期読込に`cat`・`rg`・`pwd`を使わず、`git show HEAD:<path>`で現在本文を置き換えない。
必要な文書や読取手段が不足する場合は迂回せず、未完了と報告する。
これはプロンプトによる運用指示であり、コマンド名の技術的な拒否を保証しない。
既存のsandbox・認証・承認設定を変更せず、親・子ともに共通レビュー方針の読取専用の運用を守る。
実効条件の未確認だけを理由に開始を中止せず、確認できた条件と未確認の条件を区別して報告する。

作業開始時に、このファイルと同じルートにある
[コーディング規約](.ai-config/rules/coding.md)を全文読んで適用する。
ドキュメントの作成・更新では[記載方針](.ai-config/rules/documentation.md)も全文読んで適用する。
PR作成前にも同じ記載方針を全文読んで適用する。
Markdownリンクの自動展開を前提にせず、明示的に読む。見つからなければ不足を報告する。

実装前の認識合わせにはClaude Codeの`/clarify`、Codexの`$config-clarify`を使う。
レビューを依頼された場合はClaude Codeの`/ai-dev-config-review`、Codexの`$config-review`を使う。
いずれも各ツールの入口から`.ai-config/`の共通手順を読む。

1つの Issue の開発進行には両ツールの`development-orchestrator`を使い、
[共通手順](.ai-config/workflows/development-orchestrator.md)を全文読む。
Coordinator（コーディネーター）はAIでも人間でも担える役割で、Issue の選択・起動・追跡・再開を担当する。
オーケストレーターは受け取った Issue の進行を担当する。
週次候補は同名の`weekly-discovery`から[課題発見手順](.ai-config/workflows/weekly-discovery.md)、
運用改善は同名の`development-improvement`から[振返り・効果確認](.ai-config/workflows/development-improvement.md)を全文読む。
外部実行への導入には[接続・導入テンプレート](.ai-config/templates/development-loop-integration.md)を使い、保存だけで有効化しない。

フロントエンドの新規作成・変更では[FSDルール](.ai-config/rules/fsd.md)を全文読む。
Claude Codeの`/fsd`、Codexの`$config-fsd`から導入・変更の共通手順を使う。

Cloudflareの導入・変更では[デプロイ運用ルール](.ai-config/rules/cloudflare-deploy.md)を全文読む。
Claude Codeの`/cloudflare-deploy`、Codexの`$config-cloudflare-deploy`から共通手順を使う。

レビューと修正は[ラウンドの共通定義](.ai-config/review/rounds.md)を読んで進める。
実装後のPR作成とレビュー記録は[PRへの記録手順](.ai-config/review/records.md)を全文読んで適用する。
各ラウンドでは正確性/安全性・テスト・設計/可読性を独立した担当に各1回依頼して統合する。
レビュー担当は報告のみ、修正とラウンド管理は実装担当が行う。
利用できない入口・委譲機能や未完了の観点は未完了と報告する。
実装担当が自分で読み直すことを独立レビューに数えない。

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

`/ai-dev-config-review` / `$config-review` とそこから呼ばれる `review-correctness` / `review-design` / `review-tests` skill を使うレビューは、このリポジトリでは次を前提にする。

- `review-correctness`: 実装と `docs/requirements.md` / `docs/features/*.md` の内容が矛盾していないか、挙動・仕様を変えた変更で対応する doc の更新が漏れていないかを確認する。
- `review-design`: コードおよび doc の明確さ・構成の重複を確認する。
- doc のみの変更は、それだけを理由に対応するコードのテストを機械的に要求しない(doc とコードの不整合チェックは `review-correctness` が行う)。

## 既存の配備境界

- Cloudflare の設定は `cloudflare.config.ts`、CLI とコマンドは `package.json` と lockfile が正本。既存の Worker Preview・Access 保護・本番 job を維持する。
- Preview の owner 限定 build/deploy 同一 job は既存の受入済み信頼モデル。共通ルールの導入だけで隔離済みとは扱わず、権限・認証・セキュリティ機構の変更は別途本人へ確認する。
- QA は Preview 限定。本番で `/__qa` や `qa:probe` を有効にしない。認証 Cookie・token を抽出・転送せず、Access の迂回をしない。
- CI・Preview・手動 E2E の証拠と接続契約は [開発ループ](docs/development-loop.md) に従う。一般の merge/deploy は上記既定を守り、対象と条件を特定した現在の本人の明示許可がある場合だけ Coordinator が判断する。
