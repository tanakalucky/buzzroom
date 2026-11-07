# Cloudflare デプロイの導入・変更

[運用ルール](../rules/cloudflare-deploy.md)、[コーディング規約](../rules/coding.md)、
[記載方針](../rules/documentation.md)を全文読み、依頼された工程まで進める。
計画のみ・dry の依頼では、実装や実環境操作へ進まない。

## 1. アプリを調べる

対象 repo の AGENTS、package/lockfile、framework/runtime、ビルド出力、adapter、
wrangler/cf 設定、bindings/migration、既存 Actions・deploy・E2E を読む。秘密の値や ignored は読まない。
Workers Builds 等の既存経路も確認し、二重 deploy や cleanup の競合を避ける。
repo で分かることは先に調べ、対象 account/Worker、既存経路の扱い、方式の変更など、決められない点だけ質問する。

利用時点の公式資料と、アプリで固定した CLI の version/help を照合する。未導入の CLI を使えるとは断定しない。
以下を起点に対象構成に必要なページを読む。取得できない仕様や CLI の実効値は未確認と記す。

- [Worker Previews](https://developers.cloudflare.com/workers/previews/get-started/)、
  [資源の分離と制約](https://developers.cloudflare.com/workers/previews/resources/)、
  [方式の違い](https://developers.cloudflare.com/workers/previews/compare-workflows/)
- [Wrangler コマンド](https://developers.cloudflare.com/workers/wrangler/commands/)、
  [Cloudflare CLI](https://developers.cloudflare.com/cf/)、
  [framework 別ガイド](https://developers.cloudflare.com/workers/framework-guides/)

## 2. 計画と初期設定を示す

短い計画に、選んだ方式と根拠、変更ファイル、既存経路との分担、build 出力とコマンド、
`pr-番号` の作成・更新・close cleanup・main 成功 CI から本番反映までを含める。
実装できる程度に、次の対応を埋める。不明な欄を推測で実環境へ適用しない。

| 項目 | 提示する内容 |
| --- | --- |
| 対象と資源 | account/Worker/environment、preview と本番の URL・bindings・共有/専用資源 |
| 初期設定 | 必要な設定ファイル、CLI 固定版、GitHub Environment、既存 deploy との切替手順 |
| Secrets と権限 | 必要な名前・登録先・用途・最小権限。例: `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。秘密値は含めない |
| 信頼と整合性 | build/deploy の分離、信頼済み ref、成果物の検証、状態再確認・直列化・復旧経路 |
| コメント管理 | 対象 PR、専用マーカー・Bot 所有者、URL/SHA の出所、更新・cleanup 後の表示、最小権限と token の分離 |
| 実環境の検証 | 対象 PR・資源、実行する操作、成功条件、cleanup 範囲と承認済み/未承認の区別 |

必要な確認は方式や権限の判断に絞り、既に許可された作業を確認待ちに戻さない。
権限追加や実デプロイ等の承認がなければ、ローカルの実装・テストまで進め、依存する操作だけ保留する。

## 3. アプリ側に実装する

運用ルールに沿って、対象アプリの設定・薄い Actions・通常コードの処理・テストを実装する。
preview と本番の build 出力・設定の混入を防ぎ、固定した CLI と信頼済みの設定で deploy する。
成功した preview の URL/SHA を専用 Bot コメントへ作成・更新し、cleanup 後の表示も通常コードで管理する。
利用者向け文書には用途・呼出方法・初期設定を記す。個別結果は PR または作業報告へ残す。

## 4. テストとレビューを行う

通常コードで PR 識別、信頼境界、成果物の出所、最新 SHA、close/reopen、順序逆転、同時実行、
キャンセル/失敗後の復旧、cleanup の厳密な対象、存在なしと認証失敗、本番への混入防止を検証する。
コメントの初回作成・既存更新・他者除外・一覧のページング・重複防止・古い head の抑止・
cleanup 後の表示・投稿失敗後の復旧も検証する。AAA で準備・実行・検証を分け、deploy/コメント API は fake 等へ差し替える。
アプリ E2E はローカル配信を基本とし、CI も同じテストコードを呼ぶ。外部サービスの書込は承認範囲に限る。
[レビューと修正の共通定義](../review/rounds.md)に従い、両ツールの既存レビュー入口で独立3観点を実施する。

## 5. 許可済みの実環境で一連検証する

対象と作成・更新・削除・コメント操作が承認済みで、必要な接続がある場合にだけ実施する。
PR 作成 → `pr-番号` の URL と SHA、専用コメントへの投稿を確認 → 追加 push → 同じ preview の更新と
同じコメントの更新を確認 → PR close → preview と対象の専用資源の cleanup、コメントの削除済み表示を確認する。
検証用 PR の作成・push・close も承認範囲に含める。
main の本番反映は許可された場合だけ確認し、検証のために無断で merge しない。
実環境がない、または未承認なら dry の計画/出力確認とローカルテストで止め、実デプロイ成功とは報告しない。

## 6. 結果を報告する

変更点、使い方と初期設定、選択方式の理由、実行した検証と読取判断、レビュー結果、
実環境で確認した URL/SHA/cleanup とコメント、未実施・未確認・保留理由を簡潔に示す。
残存資源や復旧が必要なら対象を特定する。秘密値は結果・ログにも載せない。
