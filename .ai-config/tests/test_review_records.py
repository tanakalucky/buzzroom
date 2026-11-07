"""PR記録の配布経路と運用契約を検証する。GitHubへの投稿は行わない。"""

from pathlib import Path
import re
import tempfile
import unittest

from test_layout import ROOT, copy_distribution, resolved_links


class ReviewRecordTests(unittest.TestCase):
    def test_コピー後も実装担当と両レビュー入口が同じ記録手順へ到達する(self):
        # 準備 (Arrange)
        callers = ("AGENTS.md", "CLAUDE.md", ".agents/skills/config-review/SKILL.md",
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

    def test_レビュー前に通常PRを用意し詳細をコメントへ分離する(self):
        # 準備 (Arrange)
        requirements = ("レビューを始める前に通常PRを作成する", "ユーザーがDraftを指定した場合はそれに従い",
                        "PRが既にあれば再利用", "テンプレートの原文を読み",
                        "PR本文は変更概要と関連Issueを中心に簡潔", "詳細はPRコメントへ残し",
                        "READMEへ作業履歴を追記しない")

        # 実行 (Act)
        content = read_records()

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)

    def test_投稿と修正をレビュー担当へ移さず権限不足を記録する(self):
        # 準備 (Arrange)
        entries = (".agents/skills/config-review/SKILL.md",
                   ".claude/skills/ai-dev-config-review/SKILL.md")
        requirements = ("タスクで許可された範囲", "外部変更の許可にならない",
                        "結果を返すだけで投稿・修正しない", "レビューだけの依頼ではPRを新規作成しない",
                        "PR記録は未完了と明記", "投稿できないことを指摘なしにしない",
                        "秘密情報・認証情報・生の私的ログは転記せず")

        # 実行 (Act)
        content = read_records()
        instructions = [(ROOT / name).read_text(encoding="utf-8") for name in entries]

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)
        for entry in instructions:
            self.assertIn("全文読み、記録用の結果を実装担当へ返す。レビュー担当は投稿しない", entry)

    def test_再開や応答不明時に同じラウンドとコメントを重複させない(self):
        # 準備 (Arrange)
        requirements = ("既存コメントを全ページ確認", "1ラウンドにつき1コメント", "最初の呼出前",
                        "同じコメントを更新", "同じマーカーとコメントIDを再確認",
                        "新規投稿はマーカーがない場合だけ", "重複や他の実行との競合",
                        "成否を確認", "確認できるまで再送しない", "未保存の本文と対象PR・コメントID",
                        "回数をリセットせず", "記録の再送だけでレビューを再実行しない")

        # 実行 (Act)
        content = read_records()

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)

    def test_指摘の固定IDと版と判断理由を除外候補も含めて残す(self):
        # 準備 (Arrange)
        requirements = ("同じ問題の再指摘・修正・再確認では同じID", "全ての出典を残す",
                        "統合で除外する候補にもID", "前ラウンドの未解決IDを省略しない",
                        "初出対象・元の重要度・出典は保持", "修正commitも記す",
                        "初出対象を上書きしない", "理由は全結果に必須",
                        "以前の行を消さず新しい履歴行", "再現できない状態は未確認")
        outcomes = ("open", "fixed", "no_action", "false_positive", "duplicate")

        # 実行 (Act)
        content = read_records()

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)
        for outcome in outcomes:
            self.assertIn(f"`{outcome}`（", content)

    def test_全候補の出典から固定IDと指摘表と履歴を照合して記録漏れを止める(self):
        # 準備 (Arrange)
        requirements = ("各担当から採用・除外・未分類を含む全候補を集め",
                        "担当別の候補件数と出典を確定",
                        "全候補の出典→固定ID→指摘表→対応履歴を全件照合",
                        "重複を同じIDへ統合した場合も全ての出典との対応を残す",
                        "漏れ・件数不一致・出典不明があれば記録は未完了",
                        "保存後の本文でも同じ照合")

        # 実行 (Act)
        content = read_records()

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)

    def test_元重要度のない候補をP2へ変えず未解決なら収束を保留する(self):
        # 準備 (Arrange)
        requirements = ("元重要度がない候補は重要度欄を`unclassified`（未分類）",
                        "重要度未付与とその理由を記録", "自動的にP2へ分類しない",
                        "分類または根拠付きの除外は対応履歴に追記",
                        "未解決の`unclassified`候補は未解決IDに含め",
                        "P0/P1が0件・収束とは扱わない",
                        "未完了・収束未確認", "未分類の未解決件数")

        # 実行 (Act)
        content = read_records()
        template, = re.findall(r"```markdown\n(.*?)\n```", content, re.DOTALL)

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)
        self.assertIn("未分類の未解決件数", template)

    def test_固定テンプレートが対象と三観点と指摘と履歴を独立して持つ(self):
        # 準備 (Arrange)
        content = read_records()

        # 実行 (Act)
        template, = re.findall(r"```markdown\n(.*?)\n```", content, re.DOTALL)
        sections = re.split(r"^### ", template, flags=re.MULTILINE)
        tables = [section for section in sections if "| --- |" in section]

        # 検証 (Assert)
        self.assertTrue(template.startswith("<!-- ai-dev-config-review:v1 round=<N> -->"))
        for key in ("PR", "ラウンド", "固定base", "レビュー対象", "前回からの修正",
                    "統合後の指摘数", "未解決ID", "判定・停止理由"):
            self.assertIn(f"- {key}:", template)
        self.assertEqual(len(tables), 3)
        for aspect in ("正確性/安全性", "テスト", "設計/可読性"):
            self.assertIn(f"| {aspect} |", tables[0])
        self.assertIn("| ID | 重要度 | 出典 | 初出対象 | 箇所・内容・根拠 |", tables[1])
        self.assertIn("| ID | 判定ラウンド | 対応対象 | 結果 | 判断理由・修正内容 | 検証 |", tables[2])

    def test_記録の完了や修正済みを独立レビューと収束の代わりにしない(self):
        # 準備 (Arrange)
        requirements = ("最大3回・独立3観点・P0/P1収束条件を維持",
                        "`pending` / `completed` / `failed` / `incomplete`",
                        "担当の完了通知と検証の実行は別", "実行者・操作・対象・観測結果",
                        "子担当の申告、親ではログ未確認", "未実行・読取判断",
                        "未確認条件を保証済みとしない", "未解決のP0/P1を`no_action`で収束扱いにせず",
                        "修正後未レビューの状態も収束としない", "最終的な収束は共通定義だけで判定")

        # 実行 (Act)
        content = read_records()

        # 検証 (Assert)
        for requirement in requirements:
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, content)


def read_records() -> str:
    return (ROOT / ".ai-config/review/records.md").read_text(encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
