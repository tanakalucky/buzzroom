"""開発ループの配布先で、両ツールの薄い入口を照合する。"""

from pathlib import Path
import tempfile
import unittest

from test_layout import SHARED_NAMES, copy_distribution, frontmatter, resolved_links, skill_path


class CycleLayoutTests(unittest.TestCase):
    def test_コピー後の三用途の入口が同名で同じ共通本文だけを参照する(self):
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)

            # 実行 (Act)
            entries = {name: [skill_path(copied, host, name)
                              for host in (".agents", ".claude")]
                       for name in SHARED_NAMES}

            # 検証 (Assert)
            for name, paths in entries.items():
                with self.subTest(name=name):
                    expected = {copied / ".ai-config/workflows" / f"{name}.md"}
                    self.assertEqual(paths[0].read_bytes(), paths[1].read_bytes())
                    for path in paths:
                        self.assertEqual(frontmatter(path)["name"], name)
                        self.assertEqual(resolved_links(path), expected)


if __name__ == "__main__":
    unittest.main()
