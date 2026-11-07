"""外部操作なしで実コードの否定/肯定ケースとコピー先CLIを検証する。"""

import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from test_layout import ROOT, copy_distribution


HELPER = Path('.ai-config/helpers/orchestrator_dry_run.py')
FIXTURE = Path('.ai-config/tests/fixtures/orchestrator_dry_run.json')
SPEC = importlib.util.spec_from_file_location('orchestrator_dry_run', ROOT / HELPER)
DRY_RUN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DRY_RUN)
FIXTURES = json.loads((ROOT / FIXTURE).read_text(encoding='utf-8'))


class OrchestratorDryRunTests(unittest.TestCase):
    def test_再開承認重複と不明送信の入力を実際に判定する(self):
        self.assert_cases('startup')

    def test_同head品質と承認シナリオ対応を実際に判定する(self):
        self.assert_cases('quality')

    def test_独立五人の同候補同版の投票を実際に判定する(self):
        self.assert_cases('vote')

    def test_週次の再実行と既存記録と応答不明を実際に判定する(self):
        self.assert_cases('weekly')

    def test_改善の実施状況と事前固定基準と比較可能性を実際に判定する(self):
        self.assert_cases('effect')

    def test_入力不足や型違いを成功と扱わない(self):
        # 準備 (Arrange)
        malformed = [None, [], {}, {'operation': 'unknown'}]
        malformed.extend({'operation': operation} for operation in FIXTURES['inputs'])
        required = {
            'startup': ('repository', 'issue', 'branch', 'head', 'base', 'resumed',
                        'instruction_source', 'send_status', 'active_executions', 'review_round', 'scenario',
                        'pr', 'stage', 'stop_reason', 'questions', 'approval_target', 'records'),
            'quality': ('repository', 'branch', 'head', 'base', 'ci', 'reviews', 'preview', 'scenarios', 'e2e', 'change_type'),
            'vote': ('target', 'voters', 'ballots'),
            'weekly': ('target', 'send_status', 'existing'),
            'effect': ('issue_url', 'before', 'current_criteria', 'target', 'implementation', 'after', 'comparable'),
        }
        for operation, keys in required.items():
            for key in keys:
                changed = copy.deepcopy(FIXTURES['inputs'][operation])
                changed[key] = None
                malformed.append(changed)

        # 実行 (Act)
        results = [DRY_RUN.evaluate(evidence) for evidence in malformed]

        # 検証 (Assert)
        for evidence, decision in zip(malformed, results):
            with self.subTest(evidence=evidence):
                self.assertIn(decision['status'], ('blocked', 'held', 'waiting'))

    def test_三賛成で採用しても反対票と理由を保持し入力を変更しない(self):
        # 準備 (Arrange)
        evidence = copy.deepcopy(FIXTURES['inputs']['vote'])
        original = copy.deepcopy(evidence)

        # 実行 (Act)
        decision = DRY_RUN.evaluate(evidence)

        # 検証 (Assert)
        self.assertEqual(decision['status'], 'accepted')
        self.assertEqual(decision['approvals'], 3)
        self.assertEqual(decision['ballots'], original['ballots'])
        self.assertEqual(sum(ballot['decision'] == 'no' for ballot in decision['ballots']), 2)
        self.assertTrue(all(ballot['reason'] for ballot in decision['ballots']))
        self.assertEqual(evidence, original)

    def test_コピー先のCLIが合成ケースを実行して期待結果を照合する(self):
        # 準備 (Arrange)
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory)
            copy_distribution(copied)
            command = [sys.executable, str(HELPER), '--fixtures', str(FIXTURE)]

            # 実行 (Act)
            completed = subprocess.run(command, cwd=copied, capture_output=True, text=True)
            checks = json.loads(completed.stdout)

            # 検証 (Assert)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(len(checks), len(FIXTURES['cases']))
            self.assertTrue(all(check['passed'] for check in checks))

    def assert_cases(self, operation):
        # 準備 (Arrange)
        cases = [case for case in FIXTURES['cases'] if FIXTURES['inputs'][case['input']]['operation'] == operation]
        self.assertTrue(cases)
        for case in cases:
            with self.subTest(case=case['name']):
                evidence = DRY_RUN.fixture_input(FIXTURES, case)

                # 実行 (Act)
                decision = DRY_RUN.evaluate(evidence)

                # 検証 (Assert)
                for key, expected in case['expected'].items():
                    self.assertEqual(decision[key], expected)
                self.assertTrue(decision['reasons'])


if __name__ == '__main__':
    unittest.main()
