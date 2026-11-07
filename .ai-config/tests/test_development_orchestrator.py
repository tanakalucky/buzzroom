"""コピー先のプロンプト契約を静的に検証する。実モデルや外部操作は実行しない。"""

from pathlib import Path
import tempfile
import unittest

from test_layout import ROOT, copy_distribution, frontmatter, resolved_links


class DevelopmentOrchestratorTests(unittest.TestCase):
    def test_接続契約は本人識別と代理投稿を区別しURLだけで承認にしない(self):
        # 準備 (Arrange)
        template = ROOT / ".ai-config/templates/development-loop-integration.md"

        # 実行 (Act)
        workflow = read_workflow()
        connection = template.read_text(encoding="utf-8")

        # 検証 (Assert)
        for phrase in ("URL/IDの存在だけでは", "認証された本人として識別した発言",
                       "既存の本人の許可範囲", "代理投稿IDの台帳", "引用・コードブロック",
                       "第三者コメントを本人承認にしない", "依存する外部変更と承認判断を止めて"):
            self.assertIn(phrase, workflow)
        for phrase in ("本人と出典の識別", "代理投稿ID台帳", "出典URL/IDだけで本人承認にせず",
                       "質問/記録・引用・第三者コメントを新たな本人承認にしない"):
            self.assertIn(phrase, connection)

    def test_通常PRを用いオーケストレーターが既存ラウンド管理を一本化する(self):
        # 準備 (Arrange)
        requirements = ("通常PRを既定", "実装側のまとめ役", "進行責任を持つ",
                        "実作業担当", "別のラウンド管理を始めない",
                        "オーケストレーターが実装・レビュー・修正を依頼",
                        "回数と再依頼を一元管理", "最大3ラウンド")

        # 実行 (Act)
        content = read_workflow()

        # 検証 (Assert)
        for requirement in requirements:
            self.assertIn(requirement, content)
        self.assertNotIn("回数・修正・再依頼は実装担当が管理し", content)

    def test_コピーした両入口は同名で共通本文だけへ案内する(self):
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)
            entries = [copied / host / "skills/development-orchestrator/SKILL.md"
                       for host in (".agents", ".claude")]
            workflow = copied / ".ai-config/workflows/development-orchestrator.md"

            # 実行 (Act)
            contents = [path.read_text(encoding="utf-8") for path in entries]
            targets = [resolved_links(path) for path in entries]

            # 検証 (Assert)
            self.assertEqual(contents[0], contents[1])
            for entry, content, links in zip(entries, contents, targets):
                self.assertEqual(frontmatter(entry)["name"], "development-orchestrator")
                self.assertEqual(set(frontmatter(entry)), {"name", "description"})
                self.assertEqual(links, {workflow})
                self.assertIn("全文読んでから実行", content)
                self.assertIn("読めなければ不足を報告", content)
            for name in ("AGENTS.md", "CLAUDE.md"):
                self.assertIn(workflow, resolved_links(copied / name))
            self.assertFalse((copied / ".github/workflows").exists())

    def test_コピー後も既存の規約とレビュー正本を読む(self):
        # 準備 (Arrange)
        dependencies = ("workflows/clarify.md", "rules/coding.md", "rules/documentation.md",
                        "review/workflow.md", "review/policy.md", "review/rounds.md",
                        "review/records.md")
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)

            # 実行 (Act)
            links = resolved_links(copied / ".ai-config/workflows/development-orchestrator.md")

            # 検証 (Assert)
            for name in dependencies:
                self.assertIn(copied / ".ai-config" / name, links)
            self.assertIn(copied / ".agents/review-runtime.md", links)

    def test_本人確認待ちは対象シナリオの明確な承認まで実装しない(self):
        # 準備 (Arrange)
        requirements = ("利用場面・操作・期待結果・失敗ケース", "明確な承認を得るまで実装に入らない",
                        "無回答・曖昧な返答・Issue 採用をシナリオ承認に置き換えない",
                        "変更部分を再確認", "仕様が曖昧なら質問して待つ",
                        "採用済み Issue の必要性を再投票しない")

        # 実行 (Act)
        content = read_workflow()
        transition = transition_rows(content)["本人確認待ち"]

        # 検証 (Assert)
        for requirement in requirements:
            self.assertIn(requirement, content)
        self.assertIn("明確な承認/必要な回答がない | 実装せず同じ記録で待機", transition[0])
        self.assertIn("対象版と範囲への明確な承認/根拠ある回答 | 実作業担当へ委譲", transition[1])

    def test_再開は現物と既存記録を照合し重複実行や無条件再送を避ける(self):
        # 準備 (Arrange)
        fields = ("repository", "Issue URL", "実行URL", "branch", "PR URL", "固定base SHAと由来",
                  "対象head SHA", "現在段階", "停止理由", "回答待ちの質問", "本人の承認対象",
                  "シナリオ版・範囲・明示回答への参照", "レビュー回数", "既存記録")

        # 実行 (Act)
        content = read_workflow()
        transitions = transition_rows(content)

        # 検証 (Assert)
        for field in fields:
            self.assertIn(field, content)
        self.assertIn("同じ Issue で並行重複実行をしない", content)
        self.assertIn("起動・投稿・dispatch の結果不明時", content)
        self.assertIn("現物を再取得", content)
        self.assertIn("確認できるまで無条件に再送しない", content)
        self.assertIn("新規へ戻さず未完了で確認", content)
        self.assertIn("疑問・根拠・本人の回答・決定", content)
        self.assertIn("重複起動せず停止", transitions["起動/再開"][0])
        self.assertIn("承認・記録・回数を引き継いで該当段階へ", transitions["停止"][0])

    def test_実装を委譲し独立レビューに実装会話を継承しない(self):
        # 準備 (Arrange)
        requirements = ("実装・E2E 作成・修正・テストを依頼", "対象 head を固定",
                        "同じ固定base→対象head の全差分", "実装会話・判断を継承しない",
                        "新しい独立サブエージェント3人", "正確性/安全性・テスト・設計/可読性を各1回",
                        "同じ対象差分・要件と承認済みシナリオ・必要規約", "自己正当化を継承しない",
                        "読取専用", "秘密/ignored を除外", "shell は Git 読取に限定",
                        "未確認だけでは停止しない", "未確認の保証もしない",
                        "最大3ラウンド", "記録形式は既存の定義を変更しない")

        # 実行 (Act)
        content = read_workflow()

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)

    def test_古いheadや未完了レビューでは最終品質を達成しない(self):
        # 準備 (Arrange)
        requirements = ("すべて同じ最終head SHA", "ローカル成功を CI 成功にしない",
                        "P0/P1 が解消済み", "未分類/未完了がない", "修正後未レビューは成功にしない",
                        "head 変更、rebase、マージ競合解消後", "成功を流用しない",
                        "レビュー回数はリセットせず", "残り回数がなければ上限として停止")

        # 実行 (Act)
        content = read_workflow()
        transitions = transition_rows(content)

        # 検証 (Assert)
        for requirement in requirements:
            self.assertIn(requirement, content)
        self.assertIn("未完了停止（成功にしない）", transitions["独立レビュー"][0])
        self.assertIn("古い成功を破棄", transitions["最終品質確認"][0])

    def test_E2Eは完成した正しいpreviewのURLとSHAで追跡する(self):
        # 準備 (Arrange)
        requirements = ("preview deployment の完了・成功", "既存 workflow の実結果",
                        "正しい preview deployment URL と SHA を確定後",
                        "既存の承認済み手段", "E2E 実行・追跡を依頼",
                        "run・対象 URL・SHA・結果を照合",
                        "未実行/skipped/対象不一致/認証で見られない場合は成功にしない",
                        "CI 未導入や preview/E2E 不在は未実行", "既存 Issue の重複を確認")

        # 実行 (Act)
        content = read_workflow()
        transitions = transition_rows(content)

        # 検証 (Assert)
        for requirement in requirements:
            self.assertIn(requirement, content)
        self.assertIn("未完了停止、理由と不足を報告", transitions["最終品質確認"][1])

    def test_汎用本文は外部操作や権限拡大を許可しない(self):
        # 準備 (Arrange)
        requirements = ("外部の CI/E2E/merge 自体を許可しない", "対象 repo/branch と現在の明示許可",
                        "branch-only", "Draft 指定と本人確認待ちを維持", "次の repo へ自動適用しない",
                        "権限拡大・認証情報作成・外部サービスやユーザーの設定変更・本番データ操作は行わない",
                        "クレジット購入・新規課金・契約は行わず",
                        "非公開情報・秘密・認証情報・生の私的ログを転載せず",
                        "repo 固有の資源/認証情報/契約を埋め込まない",
                        "静的テストだけで実モデル", "スケジューラーや生成基盤は作らない")

        # 実行 (Act)
        content = read_workflow()

        # 検証 (Assert)
        for requirement in requirements:
            self.assertIn(requirement, content)
        for repository in ("ai-dev-config/pull/", "Buzzroom", "tanakalucky"):
            self.assertNotIn(repository, content)


def read_workflow() -> str:
    return (ROOT / ".ai-config/workflows/development-orchestrator.md").read_text(encoding="utf-8")


def transition_rows(content: str) -> dict:
    rows = {}
    for line in content.splitlines():
        if line.startswith("| ") and " | " in line:
            state = line.split(" | ")[0][2:]
            rows.setdefault(state, []).append(line)
    return rows


if __name__ == "__main__":
    unittest.main()
