---
name: ai-dev-config-review
description: タスク変更全体を独立3観点で1ラウンドレビューし、統合結果と継続・停止の判定を返す。報告のみ。
argument-hint: "[比較元(ブランチ/コミット)] [要件の要約]"
disallowed-tools: Write, Edit
---

# ai-dev-config-review

リンクはこのSKILL.mdからの相対参照。指定文書を全文読んでから実行し、読めなければ不足を報告する。

[共通レビュー方針](../../../.ai-config/review/policy.md)を適用する。
[ラウンドの共通定義](../../../.ai-config/review/rounds.md)を読み、指揮者から渡されたラウンドを実行する。
[PRへの記録手順](../../../.ai-config/review/records.md)を全文読み、記録用の結果を指揮者へ返す。レビュー担当は投稿しない。
`disallowed-tools: Write, Edit`で編集ツールを除外する。shellや外部ツールまで含む完全な読取専用sandboxではない。`allowed-tools`は追加しない。

[レビューの共通手順](../../../.ai-config/review/workflow.md)に従い、対象を確定して統合する。
親のinlineコンテキストで実行する。子agentを直接起動せず、そのラウンドで次の3つをSkill呼出で各1回実行して全結果を待つ。各skillは`context: fork` / `background: false`で会話履歴を持たない。
共通手順の統合確認にはSkillの完了通知と返却内容を使い、見える子の操作記録があれば照合する。Skill完了だけから個別コマンドの実行を推定しない。

- [review-correctness](../review-correctness/SKILL.md)
- [review-tests](../review-tests/SKILL.md)
- [review-design](../review-design/SKILL.md)

[専門agentの選択と差分受渡し](../../../.ai-config/workflows/agent-handoff.md)を全文読み、同一対象で3観点を直接呼ぶ。
