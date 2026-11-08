"""コピー後の配布物が単独で読めることとツール固有境界を検証する。"""

from pathlib import Path
import re
import shutil
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
DISTRIBUTION = ("AGENTS.md", "CLAUDE.md", ".ai-config", ".agents", ".claude", ".codex/agents")
REVIEW_NAMES = ("review", "review-correctness", "review-tests", "review-design")
SHARED_NAMES = ("development-orchestrator", "weekly-discovery", "development-improvement")
NAMES = ("clarify", *REVIEW_NAMES, "cloudflare-deploy", "fsd", *SHARED_NAMES)


class LayoutTests(unittest.TestCase):
    def test_copied_bundle_has_no_external_reference(self):
        """生成処理なしで、配布物のsymlinkとMarkdown参照を解決する。"""
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = (Path(directory) / "application").resolve()
            copied.mkdir()

            # 実行 (Act)
            copy_distribution(copied)
            links = [(path, link, (path.parent / link).resolve(strict=True))
                     for path in distribution_markdown(copied) for link in local_links(path)]
            claude = copied / "CLAUDE.md"

            # 検証 (Assert)
            self.assertTrue(claude.is_symlink())
            self.assertEqual(claude.readlink(), Path("AGENTS.md"))
            self.assertEqual(claude.read_bytes(), (copied / "AGENTS.md").read_bytes())
            self.assertIn(".ai-config/rules/coding.md", local_links(copied / "AGENTS.md"))
            self.assertIn(".agents/review-runtime.md", local_links(copied / "AGENTS.md"))
            self.assertFalse((copied / ".ai-config/validation").exists())
            self.assertFalse((copied / "docs").exists())
            for path, link, resolved in links:
                with self.subTest(source=path.relative_to(copied), target=link):
                    self.assertTrue(resolved.is_relative_to(copied))
                    self.assertTrue(resolved.is_file())

    def test_both_hosts_have_all_entrypoints(self):
        """既存の他skillとの共存を許し、配布対象の入口を検証する。"""
        # 準備 (Arrange)
        paths = [skill_path(ROOT, host, name)
                 for host in (".claude", ".agents") for name in NAMES]

        # 実行 (Act)
        entries = [(path, frontmatter(path)) for path in paths]

        # 検証 (Assert)
        self.assertEqual(len(entries), 2 * len(NAMES))
        for path, metadata in entries:
            with self.subTest(entry=path.relative_to(ROOT)):
                self.assertEqual(metadata["name"], path.parent.name)
                self.assertTrue(metadata["description"])

    def test_コピー後もFSDの両入口が同じルールと導入手順へ到達する(self):
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)
            expected = {copied / ".ai-config/rules/fsd.md",
                        copied / ".ai-config/workflows/fsd.md"}

            # 実行 (Act)
            entries = [resolved_links(skill_path(copied, host, "fsd"))
                       for host in (".claude", ".agents")]
            instruction_links = resolved_links(copied / "AGENTS.md")

            # 検証 (Assert)
            for links in entries:
                self.assertEqual(links, expected)
            self.assertIn(copied / ".ai-config/rules/fsd.md", instruction_links)

    def test_claude_execution_settings_are_preserved(self):
        """既存Claudeのfork・モデル・待機・Write/Edit制限を維持する。"""
        # 準備 (Arrange)
        paths = {name: skill_path(ROOT, ".claude", name) for name in REVIEW_NAMES}

        # 実行 (Act)
        entries = {name: frontmatter(path) for name, path in paths.items()}

        # 検証 (Assert)
        for name, metadata in entries.items():
            self.assertEqual(metadata["disallowed-tools"], "Write, Edit")
            self.assertNotIn("allowed-tools", metadata)
            if name != "review":
                self.assertEqual(metadata["context"], "fork")
                self.assertEqual(metadata["model"], "inherit")
                self.assertEqual(metadata["background"], "false")

    def test_codex_does_not_inherit_claude_frontmatter(self):
        """Codexのモデルや権限をClaudeのmetadataで設定したように見せない。"""
        # 準備 (Arrange)
        paths = {name: skill_path(ROOT, ".agents", name) for name in NAMES}

        # 実行 (Act)
        entries = [(name, frontmatter(path), resolved_links(path)) for name, path in paths.items()]

        # 検証 (Assert)
        for name, metadata, links in entries:
            self.assertEqual(set(metadata), {"name", "description"})
            if name in REVIEW_NAMES:
                self.assertIn(ROOT / ".agents/review-runtime.md", links)

    def test_each_host_reaches_the_same_policy_and_aspects(self):
        """両hostの入口が同一実体の共通方針・観点を参照する。"""
        # 準備 (Arrange)
        paths = [(host, name, skill_path(ROOT, host, name))
                 for host in (".claude", ".agents") for name in REVIEW_NAMES]

        # 実行 (Act)
        entries = [(host, name, resolved_links(path)) for host, name, path in paths]

        # 検証 (Assert)
        for host, name, links in entries:
            self.assertIn(ROOT / ".ai-config/review/policy.md", links)
            if name == "review":
                self.assertIn(ROOT / ".ai-config/review/workflow.md", links)
                self.assertIn(ROOT / ".ai-config/review/rounds.md", links)
                for aspect in REVIEW_NAMES[1:]:
                    self.assertIn(skill_path(ROOT, host, aspect), links)
            else:
                self.assertIn(ROOT / ".ai-config/review/reviewer.md", links)
                self.assertIn(ROOT / f".ai-config/review/{name[7:]}.md", links)

    def test_Codex実行条件から共通方針とAGENTSへ到達する(self):
        # 準備 (Arrange)
        path = ROOT / ".agents/review-runtime.md"

        # 実行 (Act)
        links = resolved_links(path)

        # 検証 (Assert)
        self.assertIn(ROOT / ".ai-config/review/policy.md", links)
        self.assertIn(ROOT / "AGENTS.md", links)


    def test_round_policy_resolves_to_one_shared_file_after_copy(self):
        """実装担当と両レビュー入口がコピー先の同一ラウンド定義へ到達する。"""
        # 準備 (Arrange)
        callers = ("AGENTS.md", ".ai-config/review/policy.md", ".ai-config/review/workflow.md",
                   ".agents/skills/ai-dev-config-review/SKILL.md", ".claude/skills/ai-dev-config-review/SKILL.md")
        with tempfile.TemporaryDirectory() as directory:
            copied = (Path(directory) / "application").resolve()
            copied.mkdir()
            copy_distribution(copied)

            # 実行 (Act)
            targets = {name: {target for target in resolved_links(copied / name)
                              if target.name == "rounds.md"} for name in callers}

            # 検証 (Assert)
            expected = copied / ".ai-config/review/rounds.md"
            self.assertTrue(expected.is_file())
            for name, links in targets.items():
                with self.subTest(caller=name):
                    self.assertEqual(links, {expected})

    def test_コピー後も両ツールのスキル名が一致し旧Codex入口が残らない(self):
        # 準備 (Arrange)
        expected = {"clarify", "fsd", "cloudflare-deploy", "ai-dev-config-review",
                    "review-correctness", "review-tests", "review-design"}
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)

            # 実行 (Act)
            commands = [{frontmatter(copied / host / "skills" / name / "SKILL.md")["name"]
                         for name in expected} for host in (".claude", ".agents")]
            legacy = [copied / ".agents/skills" / f"config-{name}" for name in NAMES]

            # 検証 (Assert)
            self.assertEqual(commands, [expected, expected])
            for path in legacy:
                self.assertFalse(path.exists(), path)

    def test_both_hosts_reach_one_documentation_policy_after_copy(self):
        """コピー後も両hostから同じREADME記載方針へ到達する。"""
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = (Path(directory) / "application").resolve()
            copied.mkdir()
            copy_distribution(copied)

            # 実行 (Act)
            entries = [copied / name for name in ("AGENTS.md", "CLAUDE.md")]
            links = [resolved_links(path) for path in entries]

            # 検証 (Assert)
            expected = copied / ".ai-config/rules/documentation.md"
            self.assertTrue(expected.is_file())
            for targets in links:
                self.assertIn(expected, targets)

    def test_コピー後も両ツールからPR作成前の共通方針へ到達する(self):
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)
            entries = [copied / name for name in ("AGENTS.md", "CLAUDE.md")]
            policy = copied / ".ai-config/rules/documentation.md"

            # 実行 (Act)
            callers = [resolved_links(path) for path in entries]

            # 検証 (Assert)
            for links in callers:
                self.assertIn(policy, links)


def copy_distribution(destination: Path) -> None:
    for name in DISTRIBUTION:
        source = ROOT / name
        if source.is_dir():
            shutil.copytree(source, destination / name, symlinks=True,
                            ignore=shutil.ignore_patterns("__pycache__"))
        else:
            shutil.copy2(source, destination / name, follow_symlinks=False)


def distribution_markdown(root: Path) -> list:
    paths = [root / "AGENTS.md", root / "CLAUDE.md", root / ".agents/review-runtime.md"]
    paths.extend((root / ".ai-config").rglob("*.md"))
    paths.extend((root / ".claude/agents").glob("*.md"))
    paths.extend(skill_path(root, host, name)
                 for host in (".claude", ".agents") for name in NAMES)
    return paths


def skill_path(root: Path, host: str, name: str) -> Path:
    entry = "ai-dev-config-review" if name == "review" else name
    return root / host / "skills" / entry / "SKILL.md"


def resolved_links(path: Path) -> set:
    return {(path.parent / link).resolve() for link in local_links(path)}


def local_links(path: Path) -> list:
    links = [link for link in re.findall(r"\]\(([^)#]+)(?:#[^)]*)?\)", path.read_text(encoding="utf-8"))
             if "://" not in link]
    # 統合先AGENTSの独自リンクは配布物の検証対象に含めない。
    if path.name in ("AGENTS.md", "CLAUDE.md"):
        return [link for link in links if link.startswith(".ai-config/") or link == ".agents/review-runtime.md"]
    return links


def frontmatter(path: Path) -> dict:
    header = path.read_text(encoding="utf-8").split("---", 2)[1]
    return dict(line.split(": ", 1) for line in header.strip().splitlines())


if __name__ == "__main__":
    unittest.main()
