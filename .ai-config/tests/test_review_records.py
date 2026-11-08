"""PR記録への配布経路とテンプレート構造を検証する。GitHubへの投稿は行わない。"""

from pathlib import Path
import re
import tempfile
import unittest

from test_layout import ROOT, copy_distribution, resolved_links


class ReviewRecordTests(unittest.TestCase):
    def test_コピー後も実装担当と両レビュー入口が同じ記録手順へ到達する(self):
        # 準備 (Arrange)
        callers = ("AGENTS.md", "CLAUDE.md", ".agents/skills/ai-dev-config-review/SKILL.md",
                   ".claude/skills/ai-dev-config-review/SKILL.md",
                   ".ai-config/review/rounds.md", ".ai-config/review/workflow.md")
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)
            records = copied / ".ai-config/review/records.md"

            # 実行 (Act)
            links = {name: resolved_links(copied / name) for name in callers}
            dependencies = resolved_links(records)

            # 検証 (Assert)
            for caller, targets in links.items():
                with self.subTest(caller=caller):
                    self.assertIn(records, targets)
            for name in ("review/policy.md", "review/rounds.md", "rules/documentation.md"):
                self.assertIn(copied / ".ai-config" / name, dependencies)


    def test_記録テンプレートの表が三つに分かれる(self):
        # 準備 (Arrange)
        content = read_records()

        # 実行 (Act)
        template, = re.findall(r"```markdown\n(.*?)\n```", content, re.DOTALL)
        sections = re.split(r"^### ", template, flags=re.MULTILINE)
        tables = [section for section in sections if "| --- |" in section]

        # 検証 (Assert)
        self.assertEqual(len(tables), 3)


def read_records() -> str:
    return (ROOT / ".ai-config/review/records.md").read_text(encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
