# Cloudflare デプロイ運用

Cloudflareの導入・変更は[共通手順](../workflows/cloudflare-deploy.md)で進め、具体的な設定・実行コードは対象アプリに置く。

## 共通のライフサイクル

| 契機 | 到達する状態 |
| --- | --- |
| PR 作成・reopen、対象 commit の CI 成功 | PR 番号から `pr-1` のような preview を作成する |
| 同じ PR への追加 push、対象 commit の CI 成功 | 同じ preview を最新 head へ更新する |
| PR close・merge | その PR の preview を cleanup する |
| main の対象 commit の CI 成功 | 本番へ反映する |

PR 番号は GitHub の正の整数から取り、ブランチ名や PR 本文を識別子・shell コードに使わない。
プレビュー URL と対象 SHA を結果に残す。本番を PR の成果物から直接昇格させない。

## PR のプレビューコメント

- 作成・更新の成功後、実デプロイ結果で確認した URL と対象 SHA を対象 PR の専用 Bot コメントに投稿する。
  同一用途の既存コメントは更新を基本とし、対象 PR・専用マーカー・Bot の所有者 ID を照合する。
  他者のコメントを書き換えない。コメント一覧の全ページを確認し、再試行や並行処理で重複を作らない。
- 投稿直前にも PR の open 状態・最新 head と成功 deploy の SHA を照合する。失敗・未作成・古い head の
  URL を最新成功として投稿しない。状態変化時は専用コメントを更新待ち・失敗等の実態に合わせて再照合する。
- cleanup 成功後は専用コメントを削除済み表示に更新して URL を稼働中として案内しない。
  cleanup 失敗・未確認時は削除済みとせず保留状態を示す。reopen 後の成功表示を古い cleanup が上書きしないようにする。
- コメント処理も deploy/cleanup と同じ直列化・最新状態確認・復旧経路に含める。投稿失敗で cleanup を妨げず、
  書込結果が不明なら読み戻してから再試行する。対象コメントの管理範囲はアプリ導入時に確認する。
  コメント API に必要な最小の書込権限だけを信頼済み job に提案し、token を未信頼 PR コードから分離する。
  権限設定と投稿・更新は各タスクの承認範囲に従う。

## 方式と配置

- 既存 Worker 配下の Worker Preview `pr-番号` を優先する。dev-tools の既存例は
  `cf previews deploy pr-1 --prebuilt`、削除は
  `wrangler preview delete --worker-name dev-tools --name=pr-1`。
  参考例であり、Worker名・コマンド・CLI版を全アプリへ固定しない。
- framework/runtime と公式 CLI の対応を調べて選ぶ。React + Vite の静的配信、SSR、Durable Objects 等を
  区別し、ビルド出力・adapter・bindings・migration を確認する。独立 Worker `app-pr-1`、
  version alias、Pages 等へ方式を変える場合は、URL・資源分離・削除方法の違いを示して利用者に確認する。
- wrangler/cf 設定、Actions、scripts、tests は対象アプリに置く。Actions はイベント・権限・job と
  通常コードの呼出を中心にし、状態判断・deploy/cleanup 処理・E2E を長い YAML 内へ埋め込まない。
  完成アプリや巨大な共通テンプレート、別の設定リポジトリへの実行時依存は追加しない。

## 信頼境界と資源

- fork PR 等の未信頼コードに deploy 用秘密を渡さない。同一 repo・作者名だけで信頼済みと判定しない。
  秘密なしの build/test と、信頼済み ref の実装を使う deploy を別 job・隔離した実行環境に分ける。
  特権側で PR の scripts・依存 install hook・実行可能な設定を実行しない。
- `pull_request_target` / `workflow_run` の権限を PR コードへ持ち込まない。成果物も未信頼入力として扱い、
  元 repo・workflow/run・成功結果・PR 番号・head SHA を照合する。展開パスと種類を制限し、
  PR 由来の設定で deploy 先・bindings・route・実行コマンドを上書きさせない。
- 本番と preview の account・Worker・environment・domain/route・vars・Secrets・bindings を明示する。
  preview が本番のデータや秘密を継承しないことを確認する。資源の自動分離を一律に仮定せず、
  DO の namespace/migration、D1/KV/R2 等の ID と共有範囲を調べ、専用資源の作成・保持・削除範囲を決める。
- GitHub permissions は job ごとの最小範囲とし、必要な Secrets 名・登録先・Cloudflare 権限を提示する。
  値を取得・表示・commit しない。GitHub 権限・Secrets 値・Cloudflare 設定を自動で広げない。
  実デプロイ・削除・credential 登録は各タスクの承認範囲に従う。このルールやスキルは包括許可を与えない。
  既存の sandbox・認証・承認条件を弱めず、拒否や不足があればその操作を止めて報告する。

## 競合と cleanup

- deploy と cleanup は repo・Worker・PR をキーに直列化し、本番は別の直列化キーを使う。
  concurrency の順序や cancellation だけで整合性を保証したと扱わない。
- 操作直前に GitHub の最新 PR 状態・head SHA・信頼条件を再取得する。open の最新成功 SHA のみ deploy し、
  closed のみ cleanup する。古い CI 完了・再実行・遅れた close が新しい preview を上書き・削除しないようにする。
  本番も main の最新 SHA と成功 CI を照合し、古い run による巻戻りを防ぐ。
- 操作中の close/reopen/push、失敗・キャンセル後も現在状態を再照合して収束させる。
  イベント取りこぼしに備え、信頼済みコードによる再試行・手動再照合などの復旧経路を用意する。
  cleanup は build 成否に依存させず、PR コードを実行せずに動かす。
- 削除は account・Worker・environment・正規化した `pr-番号` と所有関係を厳密に照合する。
  部分一致・一覧の一括削除・本番 Worker の削除へ置き換えない。付随資源は当該 PR 専用と確認できるものだけを対象にする。
  既に存在しない対象は成功として扱えるが、認証・権限・通信の失敗を「削除済み」にしない。
