"""Buzzroom固有の共通設定の配置・参照を検証する。"""

from pathlib import Path
import re
import tomllib
import unittest


ROOT = Path(__file__).resolve().parents[2]


class ProjectIntegrationTests(unittest.TestCase):
    def test_共通設定の参照がアプリ内で解決する(self):
        # Arrange
        roots = (".ai-config", ".agents", ".claude", ".codex/agents")
        documents = [ROOT / "AGENTS.md"]
        for root in roots:
            documents.extend((ROOT / root).rglob("*.md"))
            documents.extend((ROOT / root).rglob("*.toml"))

        # Act
        references = []
        for document in documents:
            text = document.read_text(encoding="utf-8")
            for link in re.findall(r"\]\(([^)]+)\)", text):
                if re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:|#", link):
                    continue
                references.append((document, document.parent / link.split("#")[0]))

        # Assert
        self.assertTrue(references)
        for document, target in references:
            with self.subTest(document=document.relative_to(ROOT), target=target):
                self.assertTrue(target.exists())
                self.assertTrue(target.resolve().is_relative_to(ROOT))

    def test_共通入口と役割定義が揃い旧入口が残らない(self):
        # Arrange
        names = ("clarify", "fsd", "cloudflare-deploy", "development-orchestrator",
                 "development-improvement", "weekly-discovery", "ai-dev-config-review",
                 "review-correctness", "review-tests", "review-design")
        roles = ("bug-researcher", "implementer", "improvement-analyst", "refactor-researcher",
                 "review-correctness", "review-design", "review-tests", "voter")

        # Act
        entries = [ROOT / tool / "skills" / name / "SKILL.md"
                   for tool in (".agents", ".claude") for name in names]
        definitions = [ROOT / tool / "agents" / ("ai-dev-" + role + extension)
                       for tool, extension in ((".codex", ".toml"), (".claude", ".md"))
                       for role in roles]

        # Assert
        self.assertTrue((ROOT / "CLAUDE.md").is_symlink())
        self.assertEqual((ROOT / "CLAUDE.md").readlink(), Path("AGENTS.md"))
        for path in entries + definitions:
            with self.subTest(path=path.relative_to(ROOT)):
                self.assertTrue(path.is_file())
                if path.suffix == ".toml":
                    definition = tomllib.loads(path.read_text(encoding="utf-8"))
                    self.assertEqual(definition["name"], path.stem)
                    self.assertTrue(definition["developer_instructions"])
        self.assertFalse(list((ROOT / ".agents/skills").glob("config-*")))
        self.assertFalse((ROOT / ".claude/skills/review").exists())


if __name__ == "__main__":
    unittest.main()
