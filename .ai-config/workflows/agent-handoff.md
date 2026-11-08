# 役割・受け渡しと専門agentの実行

## 最上位セッションと外部の依頼

CoordinatorはAIでも人間でも担える人間の代役。日次のIssue確認・整理とIssue担当への依頼、週次repo担当への依頼を行う。
依頼受理後の調査・集計・記録・品質・停止再開はrepo側で完結し、細かな進行管理をCoordinatorへ戻さない。
既存UIで依頼と既存実行を確認し、同じIssueやrunの新規重複起動をしない。日次監視のrepo内強制移植や常駐サーバーは不要。

repo側の**最上位実行セッション**が次のskillを実行する。これらのまとめ役を専門subagentとして入れ子にしない。
ブラウザCodexの既存タスクを基本とし、Claude Codeでは対象repoの通常セッションを使う。

| 最上位の担当 | 実行するskill・正本 | 入力 | 終了条件・次の担当 |
| --- | --- | --- | --- |
| Issueオーケストレーター | `development-orchestrator` / [Issue手順](development-orchestrator.md) | repository/Issue、依頼範囲・出典・許可、既存実行への参照 | 受理後の調査・本人確認・実装委譲・レビュー・同head品質・結果保存まで管理。必要な質問と再開先だけ外部へ返す |
| 週次repo担当 | `weekly-discovery` / [課題発見](weekly-discovery.md) | repository、週範囲/timezone、既存run、許可範囲 | 調査・全票・Discussion記録・採用Issueの保存確認まで。Coordinatorが日次でIssue担当へ依頼する |
| 週次repo担当（改善） | `development-improvement` / [改善](development-improvement.md) | 分析期間・3種類の記録・既存run、改善Issue/事前指標 | 分析・採用Issue保存、実施後は同Issueの効果比較と次回確認。実装を直接起動しない |

採用候補は必ずIssueへ永続記録する。実質同じ既存Issueは対応付け、作成を重複させない。
起票権限不足・結果unknown・未保存では引渡し未完了。Discussionだけやメッセージ送信だけで完了としない。
採用は実装開始・シナリオ承認・公開・merge/deployの許可ではない。

## 専門役への自己完結した依頼

最上位セッションは専門役を**直接**呼び、全結果の回収・判断・保存まで責任を持つ。
専門役は他のagentを起動せず、質問・不足・結果を最上位へ返す。ネストの対応有無を実行の必須条件にしない。

| 名前（両ツール共通） | 仕事 | 追加で渡す対象と返却物 |
| --- | --- | --- |
| `ai-dev-implementer` | 許可範囲の実装・E2E作成・修正・テスト | 要件/検証シナリオと承認または既存仕様根拠、明示変更パス・規約・停止条件。差分/実行checks/失敗・未実行を返す |
| `ai-dev-bug-researcher` | 既存仕様からの逸脱を調査 | 固定head/週/仕様・既存IssuePR。候補ID/版・再現根拠・影響・重複・最小案・不足を返す |
| `ai-dev-refactor-researcher` | 全体の動作維持refactor候補を調査 | 同じ固定head/週。維持する契約・構造上の根拠・影響/回帰検証・重複・不足を返す。bug調査と別の新規会話 |
| `ai-dev-improvement-analyst` | 1種類の資料を独立分析 | Issue疑問回答 / PRレビュー / 発見投票を別々の新規3インスタンスへ。出典・母数・失敗/手戻り・候補・不足を返す |
| `ai-dev-voter` | 同じ候補/版への1票 | 同一候補ID/版・安全な根拠・評価対象だけを新規5インスタンスへ。担当ID・対象・完了状態・賛否・理由を返す |
| `ai-dev-review-correctness` | 正確性/安全性 | 下記固定対象、[観点](../review/correctness.md)。指摘/除外候補と実施証拠を返す |
| `ai-dev-review-tests` | テスト | 同じ固定対象、[観点](../review/tests.md)。実行していないテストを成功としない |
| `ai-dev-review-design` | 設計/可読性 | 同じ固定対象、[観点](../review/design.md)。他担当の候補を受け取らず報告 |

共通入力はrepository、依頼ID/既存実行、対象・版、必要な規約の本文/参照、許可・禁止範囲、出典、停止条件。
関連リンクは自動展開を前提にせず全文読む。規約不足・必要な判断・利用不能は未完了として返す。
実装者へは書込範囲を限定する。調査・分析・投票・レビュー役は読取専用で投稿・起票・承認・mergeを行わない。
最上位が許可された外部保存を行い、未保存本文・結果不明・再開先を保持する。

独立投票は全5人完了・同候補/版・1人1票・理由を確認して3賛成以上を採用する。
先行票や他調査の判断を入力に混ぜず、全票と反対理由を残す。再投票で採用へ誘導しない。
分析の3担当も互いの分析や会話を継承しない。

## 固定対象とレビューの受渡し

[レビュー方針](../review/policy.md)・[収集手順](../review/workflow.md)・[ラウンド](../review/rounds.md)・[記録](../review/records.md)を全文適用する。
最上位が固定baseの完全SHA、最終headの完全SHA、全変更パスmanifest、staged/unstaged/未追跡を確定し、秘密/ignoredを除く。
毎回同じbase→最終対象の**累積全task差分**を3人へ渡す。直近修正だけやHEADとの差分で代用しない。
要件・承認済みシナリオ（承認不要なら既存仕様根拠）・規約・回数・過去指摘と修正の事実を自己完結させる。
実装会話/自己正当化/他担当候補は渡さず、新規独立3インスタンスを使う。resumeで前回のレビュー会話を流用しない。
全員の独立最終返却が揃うまで候補を相互共有しない。

Claudeの読取allowlist役にはshellがないため、最上位が上記全差分・manifest・対象状態・適用規約を提供する。
大きいdiffは安全な本文を分割して全件渡し、受領範囲を照合する。元から存在する共有可能な成果物をReadで渡す場合も同じ照合を行う。
子は受領diffの読取と、自分がReadした現在本文を区別し、Gitコマンドを実行したとは申告しない。
Codexは利用可能ならGit読取で同対象を取得する。どちらも対象不足や未完了を0件にしない。

## 起動・配置とruntimeの境界

- **Codex local**: project-scoped定義は `.codex/agents/*.toml`。`name`が識別子。既存 `default/worker/explorer`を上書きせず、旧 `agents.<name>.config_file`と二重登録しない。既存config.tomlを置換しない。対応クライアントで名前を指定して委譲し、実際の選択結果を確認する。
- **ブラウザCodex**: 現在の起動schemaにcustom agent選択がなければnative自動検出とは扱わない。親がTOMLの`developer_instructions`と参照本文を読み、自己完結した依頼へ明示的に渡して新規子へ委譲できる。`task_name`の一致だけではnamed定義適用の証拠でない。ブラウザ経由を維持し、CLIモデル実行へ切り替えない。
- **Claude Code**: `.claude/agents/*.md`を配布し、実versionと利用可能なAgent surfaceを確認する。最上位から名前を明示して直接委譲する（対応runtimeではAgentの`subagent_type`）。レビュー観点skillは`context: fork`と`agent`で同名専門定義へ接続する。これはskillの実行contextであり、実装会話を丸ごと継承する会話forkを独立レビューに使わない。現在の公式仕様はネスト既定3層だが、古いversionへ一般化しない。
- **Claudeのcloud**: claude.aiのcloud project threadでrepoの`.claude/skills`が利用できるとは保証しない。account-enabled skill等の別surfaceは別確認。ローカル配布をcloudの自動検出成功へ拡張しない。

Claudeは既存agentsディレクトリ変更を監視する場合があるが、初めてのディレクトリ作成・追加ディレクトリ等は再起動が必要な場合がある。
新規セッションの読込と既存セッションでの再委譲を区別して確認する。構文parse、配置、実選択、workflow完走も別の検証とする。
利用不能ならその操作だけ未実行とし、構造・設定解釈・配布検査を代替として進める。代替をnative実行成功にしない。

Codex定義ではモデル/推論量を固定せず親設定を継承し、sandbox/approval/provider/MCPを定義で置換しない。
Claudeは`model: inherit`。読取専門役の`tools`は`Read, Glob, Grep`に限定し、Bash/MCP/Skill/Agentを残さない。
`permissionMode: plan`だけで読取専用を保証しない。親modeの継承/優先も実runtimeで確認する。
Codexの読取指示は独立sandboxではない。両ツールとも実効モデル・tool・権限は起動指定と分けて記録し、未確認なら保証しない。
ユーザー領域への配置・インストール・ログイン・権限拡大・新規credential・追加課金はこの手順で許可しない。

## 再開と結果

外部へは依頼ID、成果物/Issue/PR参照、完了/未完了、必要な質問、同じ実行の再開先を返す。
内部の実行URL・branch/PR・固定base/head・承認対象/回答・現在段階・停止理由・レビュー累計/全指摘・保存ID・品質証拠はrepo側が一元保持する。
専門役の終了・再起動はIssue実行の新規化やラウンドresetではない。投票とレビューは独立性のため新規子を使うが、親の履歴と上限を引き継ぐ。
結果unknownは現物を再取得してから判断し、確認前に再送しない。停止済み/停止未確認・未作成/未確認/未保存を区別する。

同じ最終headでCI・独立レビュー・正しいpreview準備完了後のシナリオE2Eを照合する。
head変更・main取込・競合解消で古い品質成功は失効する。本人確認/操作許可/preflight/実結果は別に記録する。
改善のbefore/afterは同Issueに保存し、期間・母数・シナリオ・環境差やデータ不足は保留。実施前の基準を事後に成功へ合わせない。
質問・安全境界・品質・権限の詳細は各正本に従い、この接続で緩めない。

仕様参照: [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)、[Claude subagents](https://code.claude.com/docs/en/sub-agents)、[Claude skills](https://code.claude.com/docs/en/skills)。
