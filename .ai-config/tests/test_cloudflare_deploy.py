"""コピー先の両入口と共通運用の契約を静的に検証する。実デプロイは行わない。"""

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
                       for host, name in ((".agents", "config-cloudflare-deploy"),
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
                   for host, name in ((".agents", "config-cloudflare-deploy"),
                                      (".claude", "cloudflare-deploy"))]

        # 実行 (Act)
        contents = [(path, frontmatter(path), path.read_text(encoding="utf-8")) for path in entries]

        # 検証 (Assert)
        for path, metadata, content in contents:
            self.assertEqual(set(metadata), {"name", "description"})
            self.assertEqual(metadata["name"], path.parent.name)
            self.assertIn("Cloudflare", metadata["description"])
            self.assertIn("全文読んでから実行", content)
            self.assertIn("読めなければ不足を報告", content)
            self.assertNotIn("cf previews deploy", content)

    def test_rules_preserve_lifecycle_and_method_choice(self):
        # 準備 (Arrange)
        path = ROOT / ".ai-config/rules/cloudflare-deploy.md"
        requirements = ("PR 作成・reopen", "同じ PR への追加 push", "PR close・merge",
                        "main の対象 commit の CI 成功", "既存 Worker 配下の Worker Preview",
                        "cf previews deploy pr-1 --prebuilt",
                        "wrangler preview delete --worker-name dev-tools --name=pr-1",
                        "React + Vite", "SSR", "Durable Objects", "公式 CLI",
                        "独立 Worker `app-pr-1`", "version alias", "利用者に確認")

        # 実行 (Act)
        content = path.read_text(encoding="utf-8")

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)

    def test_rules_keep_trust_concurrency_and_approval_boundaries(self):
        # 準備 (Arrange)
        path = ROOT / ".ai-config/rules/cloudflare-deploy.md"
        requirements = ("未信頼コードに deploy 用秘密を渡さない", "別 job・隔離した実行環境",
                        "PR の scripts・依存 install hook・実行可能な設定を実行しない",
                        "元 repo・workflow/run・成功結果・PR 番号・head SHA", "展開パスと種類を制限",
                        "本番のデータや秘密を継承しない", "自動で広げない", "包括許可を与えない",
                        "sandbox・認証・承認条件を弱めず", "最新 PR 状態・head SHA・信頼条件",
                        "直列化", "close/reopen/push", "イベント取りこぼし", "復旧経路",
                        "build 成否に依存させず", "所有関係を厳密に照合", "当該 PR 専用",
                        "認証・権限・通信の失敗を「削除済み」にしない")

        # 実行 (Act)
        content = path.read_text(encoding="utf-8")

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)

    def test_workflow_covers_discovery_through_bounded_verification(self):
        # 準備 (Arrange)
        path = ROOT / ".ai-config/workflows/cloudflare-deploy.md"
        requirements = ("1. アプリを調べる", "2. 計画と初期設定を示す", "3. アプリ側に実装する",
                        "4. テストとレビューを行う", "5. 許可済みの実環境で一連検証する", "6. 結果を報告する",
                        "二重 deploy", "決められない点だけ質問", "CLI の version/help",
                        "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "秘密値は含めない",
                        "同じ preview の更新", "専用資源の cleanup", "ローカル配信を基本",
                        "コメント管理", "同じコメントの更新", "コメントの削除済み表示",
                        "通常コード", "AAA", "独立3観点", "dry の計画/出力確認",
                        "実デプロイ成功とは報告しない", "検証のために無断で merge しない")

        # 実行 (Act)
        content = path.read_text(encoding="utf-8")

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)

    def test_copied_entrypoints_reach_comment_lifecycle_contract(self):
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory).resolve()
            copy_distribution(copied)
            entries = [copied / host / "skills" / name / "SKILL.md"
                       for host, name in ((".agents", "config-cloudflare-deploy"),
                                          (".claude", "cloudflare-deploy"))]
            rules = copied / ".ai-config/rules/cloudflare-deploy.md"

            # 実行 (Act)
            targets = [resolved_links(path) for path in entries]
            content = rules.read_text(encoding="utf-8")

            # 検証 (Assert)
            for links in targets:
                self.assertIn(rules, links)
            for requirement in ("実デプロイ結果で確認した URL と対象 SHA", "対象 PR の専用 Bot コメント",
                                "既存コメントは更新を基本", "cleanup 成功後", "削除済み表示",
                                "cleanup 失敗・未確認時は削除済みとせず", "reopen 後の成功表示"):
                with self.subTest(requirement=requirement):
                    self.assertIn(requirement, content)

    def test_comment_contract_preserves_ownership_freshness_and_token_boundary(self):
        # 準備 (Arrange)
        path = ROOT / ".ai-config/rules/cloudflare-deploy.md"
        requirements = ("対象 PR・専用マーカー・Bot の所有者 ID", "他者のコメントを書き換えない",
                        "一覧の全ページ", "重複を作らない", "最新 head と成功 deploy の SHA",
                        "失敗・未作成・古い head", "最新成功として投稿しない",
                        "コメント処理も deploy/cleanup と同じ直列化", "投稿失敗で cleanup を妨げず",
                        "読み戻してから再試行", "最小の書込権限だけ", "token を未信頼 PR コードから分離",
                        "投稿・更新は各タスクの承認範囲")

        # 実行 (Act)
        content = path.read_text(encoding="utf-8")

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)


if __name__ == "__main__":
    unittest.main()
