# deploy

このリポジトリの CI/CD は GitHub Actions で構築する設計とする。このリポジトリでは Cloudflare の Workers Builds(リポジトリ連携による自動 build/deploy)の設定は行わない。Cloudflare 側で Workers Builds が無効化されているかどうかはこのリポジトリの外の話で、未確認。

## ワークフロー

- `.github/workflows/ci.yml` - `pull_request` と `push`(main)で lint・fmt check・typegen・typecheck・build・スモークテストを実行する `verify` job。main への push で `verify` が成功したときだけ、`deploy-production` job が `cf deploy --prebuilt` で Worker `buzzroom` を deploy する。
- `.github/workflows/preview-deploy.yml` - PR の作成・更新(`opened` / `synchronize` / `reopened`)で、owner 本人かつ同一リポジトリの PR に限り `cf previews deploy pr-<PR番号> --prebuilt` で Worker Preview を作成・更新する。build は `CLOUDFLARE_PREVIEW_BUILD=true` を付けて実行し、`cloudflare.config.ts` の `isPreview` を true にする。
- `.github/workflows/preview-cleanup.yml` - PR が閉じられたら(`pull_request_target`)、ピン留めした `wrangler@4.149.0` の `wrangler preview delete` で Preview を削除する。base 側のコードで動き、PR のコードは実行しない。

## 必要な secret(リポジトリの外で登録する)

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

本番 deploy job は `ci.yml` 内で GitHub Environment `production` を指定している。この Environment は GitHub 側で事前登録が必要なリソースではなく、workflow から参照された時点で GitHub が自動作成する。つまり Environment の存在自体は deploy の blocker ではない。

## 未決事項(現時点でこのリポジトリが答えを持たない)

- **本番の公開先が未決定**: `cloudflare.config.ts` にはまだ custom domain を設定していない。スターターのまま `workersDev` 等の本番公開設定も未決定で、ドメインを先取りして決めない。決まったら `cloudflare.config.ts` の `isPreview` 分岐に反映する(参考: [dev-tools の `cloudflare.config.ts` の例](https://github.com/tanakalucky/dev-tools/blob/ad2ed4c1013135c90c2346970d95d291e9def7ce/cloudflare.config.ts) のような preview/production の出し分け)。
- **実際の deploy の blocker は repository secret の未登録**: このリポジトリの外(GitHub の repository secrets 設定)で `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録するまで、`deploy-production` と Preview の deploy・削除は(secret が空のまま Cloudflare CLI を呼ばないよう各 job 内で guard した上で)失敗する。登録作業はこのタスクの範囲外。
- 上記が解決するまで、`ci.yml` の `deploy-production` と `preview-deploy.yml` / `preview-cleanup.yml` は定義のみで、実際の deploy は確認できていない。

## 参考: Worker Preview と Durable Object(将来の RoomDO 実装時向けメモ)

RoomDO はこのリポジトリではまだ実装していない(将来実装、[requirements.md](requirements.md) 参照)。実装時のために記録しておく参考情報。

同一 Worker 内で `script_name` を指定せずに定義した Durable Object クラスは、Worker Preview ごとに自動で独立した namespace・storage を持つ(Preview 間は分離され、state は同じ Preview 内でのみ存続し、Preview を削除すると state も削除される)。これは Worker Preview の話で、本番 Worker の version URL の話ではない。出典: [Cloudflare Docs - Durable Objects in Worker Previews](https://developers.cloudflare.com/workers/previews/resources/#durable-objects)。現時点では DO の設定そのものは追加しない。
