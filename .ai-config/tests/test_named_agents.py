"""配布先でのagent設定と共通正本への参照を検証する。"""

from pathlib import Path
import re
import tempfile
import unittest

from test_layout import copy_distribution, local_links

try:
    import tomllib
except ModuleNotFoundError:
    tomllib = None


ROLES = ("implementer", "bug-researcher", "refactor-researcher", "improvement-analyst",
         "voter", "review-correctness", "review-tests", "review-design")


class NamedAgentTests(unittest.TestCase):
    def test_配布先の両host定義から共通roleと既存正本へ到達する(self):
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)

            entries = [(role, copied / host / "agents" / ("ai-dev-" + role + suffix))
                       for role in ROLES for host, suffix in ((".codex", ".toml"), (".claude", ".md"))]

            for role, entry in entries:
                with self.subTest(entry=entry.relative_to(copied)):
                    direct = resolve_links(entry, copied)
                    shared = copied / ".ai-config/agents" / (role + ".md")
                    self.assertIn(shared, direct)
                    self.assertIn(copied / "AGENTS.md", direct)
                    shared_links = resolve_links(shared, copied)
                    self.assertIn(copied / ".ai-config/workflows/agent-handoff.md", shared_links)
                    if role.startswith("review-"):
                        expected = {copied / ".ai-config/review" / (name + ".md")
                                    for name in (role[7:], "policy", "reviewer", "rounds", "records")}
                    else:
                        workflow = ("development-orchestrator" if role == "implementer" else
                                    "development-improvement" if role == "improvement-analyst" else
                                    "weekly-discovery")
                        expected = {copied / ".ai-config/workflows" / (workflow + ".md")}
                    self.assertTrue(expected.issubset(shared_links))

    def test_Claude定義の名前と継承モデルとtool許可リストが有効である(self):
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)

            entries = [claude_metadata(copied / ".claude/agents" / ("ai-dev-" + role + ".md"))
                       for role in ROLES]

            names = [entry["name"] for entry in entries]
            self.assertEqual(len(names), len(set(names)))
            for role, metadata in zip(ROLES, entries):
                with self.subTest(role=role):
                    self.assertEqual(set(metadata), {"name", "description", "model", "tools"})
                    self.assertEqual(metadata["name"], "ai-dev-" + role)
                    self.assertEqual(metadata["model"], "inherit")
                    self.assertTrue(metadata["description"])
                    expected = {"Read", "Glob", "Grep"}
                    if role == "implementer":
                        expected.update(("Edit", "Write", "Bash"))
                    tools = [tool.strip() for tool in metadata["tools"].split(",")]
                    self.assertEqual(set(tools), expected)
                    self.assertEqual(len(tools), len(expected))

    def test_Claude観点skillのagent設定が配布先の定義へ解決する(self):
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)

            # 実行 (Act)
            bindings = []
            for aspect in ("correctness", "tests", "design"):
                skill = copied / ".claude/skills" / ("review-" + aspect) / "SKILL.md"
                header = dict(line.split(": ", 1) for line in
                              skill.read_text().split("---", 2)[1].strip().splitlines())
                agent = copied / ".claude/agents" / (header["agent"] + ".md")
                bindings.append((header, claude_metadata(agent)))

            # 検証 (Assert)
            for skill, agent in bindings:
                self.assertEqual(skill["context"], "fork")
                self.assertEqual(skill["agent"], agent["name"])
                self.assertEqual(set(agent["tools"].split(", ")), {"Read", "Glob", "Grep"})
            self.assertFalse((copied / ".codex/config.toml").exists())

    @unittest.skipIf(tomllib is None, "Python 3.12 CIで標準tomllibの実parseを行う")
    def test_Codex定義をTOMLとして解釈し両hostの名前と必須schemaを照合する(self):
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)

            entries = []
            for role in ROLES:
                path = copied / ".codex/agents" / ("ai-dev-" + role + ".toml")
                with path.open("rb") as stream:
                    entries.append((role, tomllib.load(stream)))

            names = [metadata["name"] for _, metadata in entries]
            self.assertEqual(len(names), len(set(names)))
            for role, metadata in entries:
                with self.subTest(role=role):
                    self.assertEqual(set(metadata), {"name", "description", "developer_instructions"})
                    for value in metadata.values():
                        self.assertIsInstance(value, str)
                        self.assertTrue(value.strip())
                    claude = claude_metadata(copied / ".claude/agents" / ("ai-dev-" + role + ".md"))
                    self.assertEqual(metadata["name"], claude["name"])
                    self.assertEqual(metadata["name"], "ai-dev-" + role)
                    links = re.findall(r"\]\(([^)#]+)(?:#[^)]*)?\)", metadata["developer_instructions"])
                    self.assertIn("../../.ai-config/agents/" + role + ".md", links)
                    self.assertIn("../../AGENTS.md", links)


def resolve_links(path: Path, root: Path) -> set:
    targets = {(path.parent / link).resolve(strict=True) for link in local_links(path)}
    for target in targets:
        if not target.is_relative_to(root) or not target.is_file():
            raise AssertionError("配布物の外部またはファイル以外の参照: " + str(target))
    return targets


def claude_metadata(path: Path) -> dict:
    # 依存を増やさず、採用した単純なYAML scalar形式だけを厳密に検証する。
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---\n", text, re.DOTALL)
    if match is None:
        raise AssertionError("先頭のYAML frontmatterがない: " + str(path))
    metadata = {}
    for line in match.group(1).splitlines():
        field = re.fullmatch(r"([a-zA-Z][a-zA-Z0-9]*): ([^\n]+)", line)
        if field is None or field[1] in metadata:
            raise AssertionError("未対応のYAMLまたは重複field: " + line)
        value = field[2]
        if value != value.strip() or any(character in value for character in ':#{}[]&*!|>\'"%@`'):
            raise AssertionError("plain scalar以外のYAML: " + line)
        metadata[field[1]] = value
    return metadata


if __name__ == "__main__":
    unittest.main()
