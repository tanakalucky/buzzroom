"""コピー先のプロンプト契約を静的に検証する。実モデルや外部操作は実行しない。"""

from pathlib import Path
import tempfile
import unittest

from test_layout import ROOT, copy_distribution, frontmatter, resolved_links


class DevelopmentOrchestratorTests(unittest.TestCase):
    def test_共通手順からラウンド正本へ到達する(self):
        # 準備 (Arrange)
        workflow = ROOT / ".ai-config/workflows/development-orchestrator.md"

        # 実行 (Act)
        links = resolved_links(workflow)

        # 検証 (Assert)
        self.assertIn(ROOT / ".ai-config/review/rounds.md", links)


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


    def test_共通手順からレビュー正本と実行条件へ到達する(self):
        # 準備 (Arrange)
        workflow = ROOT / ".ai-config/workflows/development-orchestrator.md"
        contracts = ("policy.md", "rounds.md", "records.md")

        # 実行 (Act)
        links = resolved_links(workflow)

        # 検証 (Assert)
        for name in contracts:
            self.assertIn(ROOT / ".ai-config/review" / name, links)
        self.assertIn(ROOT / ".agents/review-runtime.md", links)


if __name__ == "__main__":
    unittest.main()
