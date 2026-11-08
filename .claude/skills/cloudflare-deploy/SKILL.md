---
name: cloudflare-deploy
description: アプリに合うCloudflareデプロイ設定を導入・変更し、PR previewの作成・更新・cleanup、URLコメント、mainの本番反映を検証する。CloudflareのCI/CDやPRプレビュー運用を依頼されたときに使う。
---

# cloudflare-deploy

リンクはこのSKILL.mdからの相対参照。指定文書を全文読んでから実行し、読めなければ不足を報告する。

[Cloudflare運用ルール](../../../.ai-config/rules/cloudflare-deploy.md)を適用し、
[導入・変更の共通手順](../../../.ai-config/workflows/cloudflare-deploy.md)に従う。
依頼内容は`$ARGUMENTS`または直前の会話から受け取る。
