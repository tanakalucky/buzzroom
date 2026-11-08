---
name: review-design
description: タスク変更全体の設計と可読性をレビューする。報告のみ。
context: fork
agent: ai-dev-review-design
model: inherit
background: false
disallowed-tools: Write, Edit
---

# review-design

リンクはこのSKILL.mdからの相対参照。指定文書を全文読んでから実行し、読めなければ不足を報告する。

[共通レビュー方針](../../../.ai-config/review/policy.md)を適用する。
`disallowed-tools: Write, Edit`で編集ツールを除外する。shellや外部ツールまで含む完全な読取専用sandboxではない。`allowed-tools`は追加しない。

[観点担当の共通手順](../../../.ai-config/review/reviewer.md)と[担当観点](../../../.ai-config/review/design.md)に従い、渡された入力だけを前提に報告する。
会話履歴は引き継がれない。
