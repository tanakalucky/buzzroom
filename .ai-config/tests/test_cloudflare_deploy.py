"""コピー先の両入口と共有文書の参照・metadataを検証する。実デプロイは行わない。"""

from pathlib import Path
import tempfile
import unittest

from test_layout import ROOT, copy_distribution, frontmatter, resolved_links


class CloudflareDeployTests(unittest.TestCase):
    def test_copied_hosts_reach_the_same_rules_and_workflow(self):
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)
            entries = [copied / host / "skills" / name / "SKILL.md"
                       for host, name in ((".agents", "cloudflare-deploy"),
                                          (".claude", "cloudflare-deploy"))]
            rules = copied / ".ai-config/rules/cloudflare-deploy.md"
            workflow = copied / ".ai-config/workflows/cloudflare-deploy.md"

            # 実行 (Act)
            targets = [resolved_links(path) for path in entries]
            instructions = [resolved_links(copied / name) for name in ("AGENTS.md", "CLAUDE.md")]
            workflow_targets = resolved_links(workflow)

            # 検証 (Assert)
            self.assertTrue(rules.is_file())
            self.assertTrue(workflow.is_file())
            self.assertEqual(targets, [{rules, workflow}, {rules, workflow}])
            for links in instructions:
                self.assertIn(rules, links)
            self.assertIn(rules, workflow_targets)
            for name in ("rules/coding.md", "rules/documentation.md", "review/rounds.md"):
                self.assertIn(copied / ".ai-config" / name, workflow_targets)

    def test_entrypoints_only_route_to_shared_content(self):
        # 準備 (Arrange)
        entries = [ROOT / host / "skills" / name / "SKILL.md"
                   for host, name in ((".agents", "cloudflare-deploy"),
                                      (".claude", "cloudflare-deploy"))]

        # 実行 (Act)
        contents = [(path, frontmatter(path)) for path in entries]

        # 検証 (Assert)
        for path, metadata in contents:
            self.assertEqual(set(metadata), {"name", "description"})
            self.assertEqual(metadata["name"], path.parent.name)


    def test_コピー後の両入口が運用正本へ到達する(self):
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)
            entries = [copied / host / "skills" / name / "SKILL.md"
                       for host, name in ((".agents", "cloudflare-deploy"),
                                          (".claude", "cloudflare-deploy"))]
            rules = copied / ".ai-config/rules/cloudflare-deploy.md"

            # 実行 (Act)
            targets = [resolved_links(path) for path in entries]

            # 検証 (Assert)
            for links in targets:
                self.assertIn(rules, links)


if __name__ == "__main__":
    unittest.main()
