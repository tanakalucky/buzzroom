---
name: ai-dev-config-review
description: タスク変更全体を独立3観点で1ラウンドレビューし、統合結果と継続・停止の判定を返す。報告のみ。
---

# ai-dev-config-review

リンクはこのSKILL.mdからの相対参照。指定文書を全文読んでから実行し、読めなければ不足を報告する。

[共通レビュー方針](../../../.ai-config/review/policy.md)を適用する。
[ラウンドの共通定義](../../../.ai-config/review/rounds.md)を読み、指揮者から渡されたラウンドを実行する。
[PRへの記録手順](../../../.ai-config/review/records.md)を全文読み、記録用の結果を指揮者へ返す。レビュー担当は投稿しない。
[Codexの実行条件](../../review-runtime.md)を確認して適用する。

[レビューの共通手順](../../../.ai-config/review/workflow.md)に従い、対象を確定して統合する。
そのラウンドで次の3つを、独立した子agentに1つずつ渡して実行させ、全結果を待つ。
共通手順の統合確認には各子の完了結果と返却内容を使い、見える子の操作記録があれば照合する。子の完了だけから個別コマンドの実行を推定しない。

- [review-correctness](../review-correctness/SKILL.md)
- [review-tests](../review-tests/SKILL.md)
- [review-design](../review-design/SKILL.md)

[専門agentの選択と差分受渡し](../../../.ai-config/workflows/agent-handoff.md)を全文読み、同一対象で3観点を直接呼ぶ。
