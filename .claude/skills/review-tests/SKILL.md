---
name: review-tests
description: タスク変更全体のテストの妥当性と不足をレビューする。報告のみ。
context: fork
model: sonnet
background: false
disallowed-tools: Write, Edit
---

# review-tests

リンクはこのSKILL.mdの場所を基準に解決し、指定した文書を全文読んでから実行する。読めなければ不足を報告する。

[共通レビュー方針](../../../.ai-config/review/policy.md)を適用する。
`disallowed-tools: Write, Edit`で編集ツールを除外する。shellや外部ツールまで含む完全な読取専用sandboxではない。`allowed-tools`は追加しない。

[観点担当の共通手順](../../../.ai-config/review/reviewer.md)と[担当観点](../../../.ai-config/review/tests.md)に従い、渡された入力だけを前提に報告する。
会話履歴は引き継がれない。
