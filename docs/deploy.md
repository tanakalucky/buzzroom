# deploy

GitHub Actions で CI と deploy を行う。Workers Builds は使わない。

## ワークフロー

- `.github/workflows/ci.yml` - `pull_request` と `push`(main)で lint・fmt check・typegen・typecheck・build・スモークテストを実行する `verify` job。main への push で `verify` が成功したときだけ、`deploy-production` job が `cf deploy --prebuilt` で Worker `buzzroom` を deploy する。
- `.github/workflows/preview-deploy.yml` - PR の作成・更新(`opened` / `synchronize` / `reopened`)で、owner 本人かつ同一リポジトリの PR に限り `cf previews deploy pr-<PR番号> --prebuilt` で Worker Preview を作成・更新する。build は `CLOUDFLARE_PREVIEW_BUILD=true` を付けて実行し、`cloudflare.config.ts` の `isPreview` を true にする。
- `.github/workflows/preview-cleanup.yml` - PR が閉じられたら(`pull_request_target`)、ピン留めした `wrangler@4.149.0` の `wrangler preview delete` で Preview を削除する。base 側のコードで動き、PR のコードは実行しない。

## 必要な secret(リポジトリの外で登録する)

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

本番 deploy job は GitHub Environment `production` で動く。

## 未決事項(現時点でこのリポジトリが答えを持たない)

- **本番の公開先が未決定**: `cloudflare.config.ts` にはまだ custom domain を設定していない。スターターのまま `workersDev` 等の本番公開設定も未決定。決まったら `cloudflare.config.ts` の `isPreview` 分岐に反映する(参考: [dev-tools の例](https://github.com/cloudflare/vinext) のような preview/production の出し分け)。
- **secret・GitHub Environment が未登録**: このリポジトリの外(GitHub の repository secrets / environments 設定)で `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録するまで、`deploy-production` と Preview の deploy・削除は失敗する。登録作業はこのタスクの範囲外。
- 上記 2 点が解決するまで、`ci.yml` の `deploy-production` と `preview-deploy.yml` / `preview-cleanup.yml` は定義のみで、実際の deploy は確認できていない。
