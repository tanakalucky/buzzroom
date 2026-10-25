# deploy

このリポジトリの CI/CD は GitHub Actions で構築する設計とする。このリポジトリでは Cloudflare の Workers Builds(リポジトリ連携による自動 build/deploy)の設定は行わない。Cloudflare 側で Workers Builds が無効化されているかどうかはこのリポジトリの外の話で、未確認。

## ワークフロー

- `.github/workflows/ci.yml` - `pull_request` と `push`(main)で lint・fmt check・typegen・typecheck・build・スモークテストを実行する `verify` job。main への push で `verify` が成功したときだけ、`deploy-production` job が `cf deploy --prebuilt` で Worker `buzzroom` を deploy する。
- `.github/workflows/preview-deploy.yml` - PR の作成・更新(`opened` / `synchronize` / `reopened`)で、owner 本人かつ同一リポジトリの PR に限り `cf previews deploy pr-<PR番号> --prebuilt` で Worker Preview を作成・更新する。build は `CLOUDFLARE_PREVIEW_BUILD=true` を付けて実行し、`cloudflare.config.ts` の `isPreview` を true にする。
- `.github/workflows/preview-cleanup.yml` - PR が閉じられたら(`pull_request_target`)、ピン留めした `wrangler@4.149.0` の `wrangler preview delete` で Preview を削除する。base 側のコードで動き、PR のコードは実行しない。

## 本番の公開先

本番の公開先は `buzzroom.tanakalucky.com` に決定した。`cloudflare.config.ts` は `isPreview` が false の場合(通常 build)のみ `domains: ["buzzroom.tanakalucky.com"]` と `workersDev: false` を設定し、Preview build(`isPreview` が true)の出力にはこれらを含めない。

## secret(リポジトリの外、GitHub 側で登録する)

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

[repository Actions secrets の設定](https://github.com/tanakalucky/buzzroom/settings/secrets/actions)で上記 2 件の secret 名が登録済みであることは確認済み。値そのものの正しさや実際の権限(deploy・preview 操作に十分な権限か)は、このリポジトリのコードからは確認できず、PR 経由の Actions 実行時にのみ検証される。

本番 deploy job は `ci.yml` 内で GitHub Environment `production` を指定している。この Environment は GitHub 側で事前登録が必要なリソースではなく、workflow から参照された時点で GitHub が自動作成する。現時点で Environment 側に secret は登録されておらず、`preview-deploy.yml` / `preview-cleanup.yml` と同じ repository レベルの `secrets.CLOUDFLARE_API_TOKEN` / `secrets.CLOUDFLARE_ACCOUNT_ID` を参照するため、`production` Environment は repository secret をそのまま継承する。Environment 専用の secret を重複登録する必要はない。

## 未決事項

- 上記 secret の値・権限が実際に deploy・Preview の作成・削除に十分かは未検証。main への push・PR の Actions 実行で初めて確認できる。
- 現在のmainにはPR #1のmerge commit `75e0a80` がある。既存本番は `https://buzzroom.tanakalucky.com/`。このローカル機能実装ではActionsの本番成功SHA・Preview作成削除の証跡を新たに取得しておらず、今回の変更のpush・PR・deployも実行していない。承認後のPR/Previewと、mainへのmerge後の本番確認を分けて記録する。

## 参考: Worker Preview と Durable Object(将来の RoomDO 実装時向けメモ)

RoomDOは同Worker内にSQLite-backedとして実装し、ローカルで検証した。hosted Previewでの検証は未実施([implementation-decisions.md](implementation-decisions.md)参照)。

同一 Worker 内で `script_name` を指定せずに定義した Durable Object クラスは、Worker Preview ごとに自動で独立した namespace・storage を持つ(Preview 間は分離され、state は同じ Preview 内でのみ存続し、Preview を削除すると state も削除される)。これは Worker Preview の話で、本番 Worker の version URL の話ではない。出典: [Cloudflare Docs - Durable Objects in Worker Previews](https://developers.cloudflare.com/workers/previews/resources/#durable-objects)。今回のRoomDOはこの設定を追加済み。同Workerへの参照は `cloudflare:workers` の `exports.RoomDO` を使用し、固定の `script_name` を付けない。
