"""コピー後の配布物が単独で読めることとツール固有境界を検証する。"""

import hashlib
from pathlib import Path
import re
import shutil
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
DISTRIBUTION = ("AGENTS.md", "CLAUDE.md", ".ai-config", ".agents", ".claude")
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
        entries = [(path, frontmatter(path), path.read_text(encoding="utf-8")) for path in paths]

        # 検証 (Assert)
        self.assertEqual(len(entries), 2 * len(NAMES))
        for path, metadata, content in entries:
            with self.subTest(entry=path.relative_to(ROOT)):
                self.assertEqual(metadata["name"], path.parent.name)
                self.assertTrue(metadata["description"])
                self.assertNotIn("{{", content)

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
                self.assertEqual(metadata["model"], "sonnet")
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

    def test_codex_runtime_contract_is_present(self):
        """モデル尊重・読取運用・独立委譲を参照先の存在だけで成功としない。"""
        # 準備 (Arrange)
        path = ROOT / ".agents/review-runtime.md"
        requirements = ("ユーザー指定のモデル・推論量", "未指定なら実行セッションの設定を継承",
                        "指定が利用できない場合は勝手に別の値へ置き換えず未完了",
                        "既存のsandbox・認証・承認設定を変更せず", "書込を許可する承認は行わない",
                        "子agentにも同じモデル・推論量と共通レビュー方針を渡す",
                        "読取の開始順序と手段は[AGENTS.md]", "全文読んで適用する",
                        "独立した子agentを3人起動", "親は全結果を待つ", "会話履歴に依存しない入力",
                        "委譲できない観点は未完了", "親による代行を独立レビューと数えない",
                        "実際に確認できた値を区別して報告", "技術的な書込拒否を実現しない")

        # 実行 (Act)
        content = path.read_text(encoding="utf-8")
        initial_read = (ROOT / "AGENTS.md").read_text(encoding="utf-8")

        # 検証 (Assert)
        for requirement in requirements:
            self.assertIn(requirement, content)
        self.assertIn(ROOT / ".ai-config/review/policy.md", resolved_links(path))
        self.assertIn(ROOT / "AGENTS.md", resolved_links(path))
        for requirement in ("最初の操作からshellをGit読取に限定", "git ls-files",
                            "git diff --no-index -- /dev/null <path>",
                            "git show HEAD:<path>`で現在本文を置き換えない"):
            self.assertIn(requirement, initial_read)

    def test_codex_start_allows_unverified_runtime_conditions(self):
        """実効値の未確認を開始不可に戻さず、運用と保証の区別を保持する。"""
        # 準備 (Arrange)
        requirements = {
            ".agents/review-runtime.md": ("親・子の実効モデル・推論量・sandboxや外部ツールの無効化",
                                           "確認できないことだけを理由に開始を中止しない",
                                           "確認できない値は未確認と報告",
                                           "読取専用sandboxや外部変更ツールの無効化が保証されたとは扱わない",
                                           "Codex組込みの子agentも利用でき",
                                           "ネストしたCLI起動やOSによる書込拒否の実測は必須にしない"),
            "AGENTS.md": ("実効条件の未確認だけを理由に開始を中止せず",),
        }
        removed_gates = ("条件を確認できなければ開始せず未完了",
                         "書込拒否は実行側のread-only sandboxで別途強制",
                         "実行条件を確認できない場合や独立した委譲ができない場合は、未完了")

        # 実行 (Act)
        contents = {name: (ROOT / name).read_text(encoding="utf-8") for name in requirements}

        # 検証 (Assert)
        for name, phrases in requirements.items():
            with self.subTest(document=name):
                for phrase in phrases:
                    self.assertIn(phrase, contents[name])
                for gate in removed_gates:
                    self.assertNotIn(gate, contents[name])

    def test_shared_review_safety_contract_is_preserved(self):
        """リンク先が存在するだけで、秘密除外や未完了の条件欠落を見逃さない。"""
        # 準備 (Arrange)
        path = ROOT / ".ai-config/review/policy.md"
        requirements = ("ファイルの編集・作成・削除とGit状態の変更",
                        "外部サービスの変更操作も禁止", "PR承認・マージ・デプロイを行わない",
                        "ignoredファイルとsecrets", "内容も読まない",
                        "確定した明示パスだけを読む",
                        "失敗、未完了、空の結果を「指摘なし」にしない",
                        "失敗した観点を自動再試行して完了にしない",
                        "実行していなければ、読んで判断した旨を明記")

        # 実行 (Act)
        content = path.read_text(encoding="utf-8")

        # 検証 (Assert)
        for requirement in requirements:
            self.assertIn(requirement, content)

    def test_review_integration_checks_evidence_and_scope(self):
        """担当の完了を検証実施と混同せず、根拠と全範囲を統合時に照合する。"""
        # 準備 (Arrange)
        requirements = {
            "policy.md": ("ツール呼出と結果に対応", "子担当の申告を実行証拠に置き換えない",
                          "根拠を確認できない仮説は確定指摘にせず"),
            "reviewer.md": ("自分が実行した操作と観測結果", "渡された完全な固定SHAと明示パス"),
            "workflow.md": ("子担当の申告、親ではログ未確認", "固定baseからの収集結果",
                            "P2も必要性の根拠を確認", "実際の操作と影響を報告",
                            "この照合のために観点レビューを再実行しない"),
        }

        # 実行 (Act)
        contents = {name: (ROOT / ".ai-config/review" / name).read_text(encoding="utf-8")
                    for name in requirements}

        # 検証 (Assert)
        for name, phrases in requirements.items():
            for phrase in phrases:
                with self.subTest(document=name, requirement=phrase):
                    self.assertIn(phrase, contents[name])

    def test_round_policy_resolves_to_one_shared_file_after_copy(self):
        """実装担当と両レビュー入口がコピー先の同一ラウンド定義へ到達する。"""
        # 準備 (Arrange)
        callers = ("AGENTS.md", ".ai-config/review/policy.md", ".ai-config/review/workflow.md",
                   ".agents/skills/config-review/SKILL.md", ".claude/skills/ai-dev-config-review/SKILL.md")
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

    def test_copied_review_commands_use_distinct_names(self):
        """組込み名との衝突を戻さず、コピー後の案内と入口を一致させる。"""
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)

            # 実行 (Act)
            claude = copied / ".claude/skills/ai-dev-config-review/SKILL.md"
            codex = copied / ".agents/skills/config-review/SKILL.md"
            commands = [frontmatter(path)["name"] for path in (claude, codex)]
            instructions = [(copied / name).read_text(encoding="utf-8")
                            for name in ("AGENTS.md", "CLAUDE.md")]

            # 検証 (Assert)
            self.assertEqual(commands, ["ai-dev-config-review", "config-review"])
            for content in instructions:
                self.assertIn("`/ai-dev-config-review`", content)
                self.assertIn("`$config-review`", content)
                self.assertNotIn("`/review`", content)

    def test_コーディング規約が依頼された方針を含む本文を維持する(self):
        """AAA・日本語のテスト名・意味のまとまりごとの空行を含む本文を保持する。"""
        # 準備 (Arrange)
        content = (ROOT / ".ai-config/rules/coding.md").read_text(encoding="utf-8")
        expected = "1d0df3987276ed670b7b71ea3256d0e3b2e90efc3a582a13c226a684d80f6771"

        # 実行 (Act)
        normalized = "\n".join(line.rstrip() for line in content.splitlines() if line.strip())
        actual = hashlib.sha256(normalized.encode()).hexdigest()

        # 検証 (Assert)
        self.assertEqual(actual, expected)

    def test_テスト規約が日本語のケース名と期待する振る舞いを求める(self):
        # 準備 (Arrange)
        path = ROOT / ".ai-config/rules/coding.md"

        # 実行 (Act)
        content = path.read_text(encoding="utf-8")
        testing = content.split("## 6. テスト", 1)[1].split("## 例", 1)[0]

        # 検証 (Assert)
        self.assertIn("テストケース名は日本語", testing)
        self.assertIn("条件と期待する振る舞いが分かる名前", testing)
        self.assertIn("`正常系`や`test1`のような内容が分からない名前を避ける", testing)
        self.assertIn("AAA(Arrange・Act・Assert)", testing)

    def test_空行規約が意味ごとの分離と関連宣言のまとまりを両立する(self):
        # 準備 (Arrange)
        path = ROOT / ".ai-config/rules/coding.md"

        # 実行 (Act)
        content = path.read_text(encoding="utf-8")
        spacing = content.split("## 5. 空行", 1)[1].split("## 6. テスト", 1)[0]

        # 検証 (Assert)
        self.assertIn("変数宣言や処理は意味・目的が同じものをまとめ", spacing)
        self.assertIn("別の計算・検証・整形などへ移る箇所には空行を置く", spacing)
        self.assertIn("コード生成時も複数のまとまりを詰めて並べない", spacing)
        self.assertIn("関連する変数宣言を1件ずつ機械的に空行で分けない", spacing)

    def test_both_hosts_reach_one_documentation_policy_after_copy(self):
        """コピー後も両hostが同じREADME記載方針を明示的に読む。"""
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = (Path(directory) / "application").resolve()
            copied.mkdir()
            copy_distribution(copied)

            # 実行 (Act)
            entries = [copied / name for name in ("AGENTS.md", "CLAUDE.md")]
            links = [resolved_links(path) for path in entries]
            contents = [path.read_text(encoding="utf-8") for path in entries]

            # 検証 (Assert)
            expected = copied / ".ai-config/rules/documentation.md"
            self.assertTrue(expected.is_file())
            for targets, content in zip(links, contents):
                self.assertIn(expected, targets)
                self.assertIn("ドキュメントの作成・更新では[記載方針]", content)
                self.assertIn("documentation.md)も全文読んで適用する", content)

    def test_コピー後も両ツールからPR作成前の共通方針へ到達する(self):
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)
            entries = [copied / name for name in ("AGENTS.md", "CLAUDE.md")]
            policy = copied / ".ai-config/rules/documentation.md"

            # 実行 (Act)
            callers = [(resolved_links(path), path.read_text(encoding="utf-8"))
                       for path in entries]
            content = policy.read_text(encoding="utf-8")

            # 検証 (Assert)
            for links, instructions in callers:
                self.assertIn(policy, links)
                self.assertIn("PR作成前にも同じ記載方針を全文読んで適用する", instructions)
            self.assertIn("## PR作成", content)

    def test_PR作成方針がテンプレートの探索順と原文の案内を保持する(self):
        # 準備 (Arrange)
        path = ROOT / ".ai-config/rules/documentation.md"

        # 実行 (Act)
        content = path.read_text(encoding="utf-8")
        policy = content.split("## PR作成", 1)[1].split("## README", 1)[0]

        # 検証 (Assert)
        self.assertIn("PR作成前に、対象リポジトリのPRテンプレートを原文で全文読む", policy)
        self.assertIn("なければ所有者の`.github`リポジトリの共通PRテンプレートを探して同様に読む", policy)
        self.assertIn("HTMLコメント内の案内にも従う", policy)
        self.assertNotIn("Closes", policy)

    def test_PR本文を直接渡す場合もテンプレートの読み込みを省略しない(self):
        # 準備 (Arrange)
        path = ROOT / ".ai-config/rules/documentation.md"

        # 実行 (Act)
        content = path.read_text(encoding="utf-8")
        policy = content.split("## PR作成", 1)[1].split("## README", 1)[0]

        # 検証 (Assert)
        self.assertIn("`gh pr create --body`・`--body-file`やAPIで本文を直接渡す場合も", policy)
        self.assertIn("この読み込みを省略しない", policy)

    def test_documentation_policy_separates_usage_from_work_results(self):
        """利用者に必要な制約を残し、個別の作業結果はPRや報告へ分ける。"""
        # 準備 (Arrange)
        path = ROOT / ".ai-config/rules/documentation.md"
        requirements = ("目的・使い方・設定方法・仕様・対応範囲・既知の制約",
                        "未実施・未検証・確認待ちなどの一時的な作業状況、個別のテスト結果、レビュー回数・指摘件数、対応履歴は書かず",
                        "PR本文や作業報告に残す", "利用者が知る必要のある内容を書く",
                        "詳しい経緯はIssueやPRへ分ける", "テストの実行方法は使い方として記載してよい",
                        "といった個別作業の結果は記載しない")

        # 実行 (Act)
        content = path.read_text(encoding="utf-8")

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)

    def test_documentation_policy_distinguishes_verification_status_from_product_scope(self):
        """未検証の注意をREADMEへ戻さず、製品の対応範囲や仕様は許容する。"""
        # 準備 (Arrange)
        path = ROOT / ".ai-config/rules/documentation.md"
        excluded = "「実デプロイ未検証」は一時的な検証状況なのでREADMEには書かず、PR本文や作業報告に残す。"
        allowed = "「SSR 未対応」「初期状態ではデプロイ無効」は製品の対応範囲や仕様なのでREADMEに記載してよい。"
        obsolete = "実デプロイ未検証など、利用判断に必要な注意は省略しない"

        # 実行 (Act)
        content = path.read_text(encoding="utf-8")

        # 検証 (Assert)
        self.assertIn(excluded, content)
        self.assertIn(allowed, content)
        self.assertNotIn(obsolete, content)


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
    paths.extend(skill_path(root, host, name)
                 for host in (".claude", ".agents") for name in NAMES)
    return paths


def skill_path(root: Path, host: str, name: str) -> Path:
    if host == ".agents" and name not in SHARED_NAMES:
        entry = f"config-{name}"
    else:
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
