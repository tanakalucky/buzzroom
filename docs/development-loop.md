# 開発ループの接続と品質確認

対象は `tanakalucky/buzzroom`。配布元 `tanakalucky/ai-dev-config` の固定版
`8b9dabdc34eb493be5bd061d0c439590552c4099`から6配布物を統合する。
配布対象は `AGENTS.md`・`CLAUDE.md`・`.ai-config/`・`.agents/`・`.claude/`・`.codex/agents/`。
役割の直接委譲と受け渡しは [共通契約](../.ai-config/workflows/agent-handoff.md) に従う。
共通手順は `.ai-config/`、アプリの仕様は requirements/features、コマンドは package.json を正本とする。

## CI とローカル UI E2E

CI は PR の merge ref ではなく実際の head を checkout し、その SHA を照合する。
既存 lint・整形・型生成・型検査・通常 build・単体/DO/HTTP テストに加え、
Python 標準の構造テストと `npm run test:e2e` を実行する。
アプリ固有の構造テストは配布物の参照・入口・定義を確認し、実モデルの委譲や外部操作の成功を保証しない。

UI E2E は通常 build 後、`npx --no-install playwright install chromium` と `npm run test:e2e` で実行する。
既存 Chromium を使う場合は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` にその実行ファイルを指定できる。
127.0.0.1:4173 のみで一時 SQLite を使い、既存サーバーを再利用しない。
ブラウザ context を分離して UI の操作と表示を確認する。trace・HAR・video・storageState は保存しない。
結果 JSON は Git 管理外の `test-results/e2e.json`、CI では head/attempt 付き artifact に保存する。
テスト結果を同じ branch に commit して対象 head を変えない。

## Preview 完了後の GitHub API 起動

`preview-deploy` が完了すると、default branch の `preview-e2e-dispatch.yml` が成功結果を確認し、
GitHub REST API の `workflow_dispatch` で `preview-e2e.yml` を `main` ref に起動する。
CI のローカル E2E は引き続き速い回帰確認に使い、実 Preview の E2E 成功とは区別する。

dispatcher と対象照合は `tools/preview/` に置く。PR のコードや依存関係を実行しない job で、
次を GitHub / Cloudflare の公式 API から取得する。

- 元 run の repository・workflow path・event・最新 attempt・成功結果と owner の起動/再実行。
  workflow 全体が成功でも `Preview の deploy` step が skipped なら起動しない。
- 最新の open PR、同一 repository の head SHA、Preview `pr-N` の最新 deployment。
- Preview の `workers/commit_sha` と PR head、公式応答中の Preview URL・immutable deployment URL。
  本番 URL、任意のホスト、認証情報/query を含む URL は受け入れない。

cf beta.14 は `workers/commit_sha` を `GITHUB_SHA` 優先で採用するため、既存 deploy step は
期待 PR head と checkout SHA を照合し、cf 子プロセスだけにその SHA を渡す。
URL を組み立てただけでは配備証拠にせず、公式 API が返す URL との完全一致を必須にする。

### 起動契約と信頼境界

API 入力は `source_run_id`・`source_run_attempt`・`pr_number`・`head_sha`・`deployment_id` の5つ。
URL は入力から受け取らない。receiver は `main` 以外の ref を拒否し、実行前にも同じ照合を行う。
workflow と checker は `github.workflow_sha`、テストコードだけは照合済み PR head を checkout する。

- `actions: write` は API dispatch 専用 job だけで使う。新しい PAT や永続 credential は不要。
- 既存 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` は trusted checker の GET にだけ使い、
  PR コード・npm・Playwright を実行する E2E job へ渡さない。
- E2E job の GitHub 権限は `contents: read`、checkout は `persist-credentials: false`。
  既存 owner 限定 build/deploy 同一 job の信頼モデルを変更・隔離済みとは扱わない。
- Access 設定・Service Token・CI secret を追加しない。既存の認証が必要な対象は preflight が
  redirect・401/403・アプリ以外の応答で失敗し、Cookie/token を抽出・移送して通過させない。

新しい workflow は default branch に登録されてから利用できる。初回導入 PR の段階で
自動 dispatch が動かないことを、Hosted E2E 成功や適用免除として扱わない。
merge・権限変更・新認証の登録には、それぞれの操作の許可が必要。

### 実行と結果

Playwright は公式の immutable deployment URL に接続し、ローカルのアプリサーバーを起動しない。
最初に `/api/hello` のアプリ応答を確認し、別ブラウザ context の独立3クライアントで
架空名の専用テストルームを作る。既存ユーザーのルームや本番には操作しない。
全 context で HTTP・WebSocket の送信先を検証済み Preview origin に限定する。
ブラウザ専用のローカル proxy が redirect 後も HTTP の origin / CONNECT の送信先を接続前に検証する。
ブラウザ本来の Cookie・POST・redirect 処理を維持し、service worker と proxy の loopback bypass を無効にする。
HTTPS tunnel の origin を固定するため、この E2E の Chromium は HTTP/2 と QUIC を無効にする。
本番や別 origin への要求は送信前に遮断し、そのケースを失敗にする。
24時間の期限は参加者セッションの期限であり、ルームや得点の削除期限ではない。
ルームの運用期限は未決のため、テストルームは Preview cleanup まで残る可能性がある。
追加の削除 API や既存ルームの削除は行わない。

| ID/版              | 操作と期待結果                                                          | ケース                    |
| ------------------ | ----------------------------------------------------------------------- | ------------------------- |
| BR-UI/1 entry      | 作成・招待 gate・誤パスワード拒否・再試行・独立2参加者、3画面の人数一致 | tools/e2e/game.spec.ts    |
| BR-UI/1 buzzer     | 2参加者の順序・誤答ロック・reload 復元・正解と手動 reset                | 同上                      |
| BR-UI/1 score-host | 得点編集の全画面反映・司会交代・切断時の復帰待ちと本人復帰              | 同上                      |
| BR-UI/1 mobile     | 320/390px で横にはみ出さず早押しボタンが見える                          | 同上                      |
| BR-UI/1 room-ui    | URL コピー成功/失敗・入力中の早押し非表示・存在しないルームからの復帰   | tools/e2e/room-ui.spec.ts |

これらは [既存仕様](requirements.md)・[ルーム仕様](features/room.md) に基づく動作維持の検証。
ローカルと hosted は同じケースを使い、baseURL だけを切り替える。手動確認が必要な場合も
同じシナリオ・対象 SHA/version と既存の許可済み手段を使い、未実行を成功へ置き換えない。

E2E 後は別の trusted job が PR open/head と Preview の最新 version を再確認する。
途中で push・close・再deploy があれば成功にせず、最新 Preview の E2E を追跡する。
`/__qa` は UI E2E の代わりに使わず、本番で有効化しない。

summary と `preview-target-<run>-<attempt>` artifact に PR head・URL・version・元 deploy run/attempt、
`preview-e2e-<head>-<run>-<attempt>` に非秘密のテスト結果 JSON を保存する。
trace・HAR・video・screenshot・storageState・Cookie・token は保存しない。
workflow 自体は main 上で動くため、その GitHub head SHA を PR 検証対象と誤認せず、
artifact の `head_sha` と実 checkout SHA を PR head に照合する。

### 重複・失敗と復旧

同じ deploy run/attempt の dispatcher は直列化し、E2E run 一覧を全ページ読み、
`Preview E2E <source_run_id>/<source_run_attempt>` があれば重複起動しない。
同じ PR の E2E も直列化する。GitHub concurrency は処理順や exactly-once を保証しないため、
receiver の実行前後の状態確認も必須とする。

API POST の通信失敗は成否不明として停止し、自動再送しない。Actions の上記 run-name を
確認してから再開する。既存 run の失敗はその run を再実行し、古い source attempt や
head/version の不一致では最新 Preview deploy を確認する。Access や権限の不足は
設定を勝手に広げず報告する。skipped・キャンセル・未実行も成功に数えない。

repo 最上位の指揮者は CI・独立3観点・Preview・Hosted E2E を同じ最終 PR head に照合する。
head 変更時は過去の成功を流用しない。merge は対象 repo/branch と現在の明示許可・全品質条件・
安全条件が成立した場合だけ行う。実装者子・レビュー担当は merge/deploy を行わない。
本番は新 main の CI/deploy 成功後、`/`・`/api/hello`・`/__qa` の404を read-only で確認し、
検証用ゲームデータを書き込まない。

## 既存実行と週次2系統の接続契約

Coordinatorは日次のIssue確認・整理と依頼、本人への質問・結果の受け渡しを担う。依頼前に既存UIのrepo/Issue・既存依頼を確認し、受理後はrepo最上位の指揮者が既存実行の管理先でrepo/Issue/実行URLを照合して同じ実行の進行・品質・停止再開・重複防止を管理する。
この文書は外部 automation の変更・複製起動・スケジュール・自動投稿を有効化しない。
実行管理先への安全な参照と本人識別は外側の Coordinator が保持し、私的な識別子や指示本文を公開 repo へ転記しない。
停止時は固定 base/head、branch/PR、段階、質問と承認対象、レビュー回数、既存記録を引き継ぐ。

週次は `repository / 週開始・終了 / timezone / bug|refactor` をキーに、独立した2系統で進める。
週範囲・timezone・固定 head は開始時に明示する。Discussion は系統ごとに1つ、候補 ID/版と採否・反対理由をその中に保持する。
投稿担当は有効な Discussions/category と操作権限を読取確認し、全ページの既存 Discussion/Issue を照合して重複を避ける。
Discussion が無効、権限不足、送信結果 unknown の場合は投稿を止め、設定変更や別経路の再送で迂回しない。
独立5人の同候補・同版への全票完了と3賛成で採用し、採用 Issue の必要性を再投票しない。
将来の週次実行・投稿には、その対象に有効な本人の許可と既存接続が必要である。
