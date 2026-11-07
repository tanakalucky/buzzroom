"""入力証拠だけを照合する dry-run。外部の実在・独立性・権限を保証せず、操作しない。

JSON object の operation は startup / quality / vote / weekly / effect。
具体的な入力は tests/fixtures/orchestrator_dry_run.json を参照する。
startup の previous_status は found / absent / unknown。既存の previous dict は
指定省略時だけ found と扱う。真新規は absent・previous キーなし・review_round=0 を
明示する。missing/null だけでは不在確認にせず、現物の確認は呼出側が行う。
出力 status/action/reasons は判断材料であり、外部操作の許可ではない。
"""

import argparse
import copy
from datetime import date
import json
import math
from pathlib import Path
import re


ASPECTS = {"correctness", "tests", "design"}
RESUME_FIELDS = ("repository", "issue", "execution_url", "branch", "pr", "base", "head",
                 "stage", "stop_reason", "questions", "approval_target", "review_round", "records")


def evaluate(evidence: dict) -> dict:
    """1組の入力を照合する。不正入力は成功や外部操作へ進めない。"""
    handlers = {"startup": startup, "quality": quality, "vote": vote,
                "weekly": weekly, "effect": effect}
    try:
        if not isinstance(evidence, dict) or evidence.get("operation") not in handlers:
            return result("blocked", "correct_input", "unknown_operation")
        return handlers[evidence["operation"]](evidence)
    except (KeyError, TypeError, ValueError, AttributeError):
        return result("blocked", "correct_input", "invalid_input")


def startup(evidence: dict) -> dict:
    """出典、同Issue実行、送信不明、再開台帳、シナリオ承認を順に確認する。"""
    if not nonempty(evidence.get("instruction_source")):
        return result("blocked", "confirm_instruction", "missing_instruction_source")
    if evidence.get("send_status") == "unknown":
        return result("blocked", "reacquire", "unknown_send")
    if evidence.get("send_status") not in ("not_sent", "confirmed"):
        return result("blocked", "correct_input", "invalid_send_status")
    if any(not nonempty(evidence.get(key))
           for key in ("repository", "issue", "branch")):
        return result("blocked", "reacquire", "missing_task_identity")
    if not valid_sha(evidence["base"]) or not valid_sha(evidence["head"]) or not valid_round(evidence["review_round"]):
        return result("blocked", "reacquire", "invalid_identity_or_round")
    if type(evidence["resumed"]) is not bool:
        return result("blocked", "correct_input", "invalid_resume_flag")
    active = evidence["active_executions"]
    if not isinstance(active, list) or any(not nonempty(url) for url in active):
        return result("blocked", "reacquire", "invalid_execution_records")
    if len(active) > 1 or (active and active[0] != evidence.get("execution_url")):
        return result("blocked", "continue_existing_task", "duplicate_execution")
    if active and not evidence["resumed"]:
        return result("blocked", "reacquire", "existing_task_requires_resume_record")

    previous = evidence.get("previous")
    previous_status = evidence.get("previous_status", "found" if isinstance(previous, dict) else "unknown")
    if not evidence["resumed"]:
        if previous_status != "absent" or "previous" in evidence or evidence["review_round"] != 0:
            return result("blocked", "reacquire", "new_task_requires_confirmed_absence")
    if evidence["resumed"]:
        if previous_status != "found" or not valid_resume_record(previous) or not valid_resume_record(evidence):
            return result("blocked", "reacquire", "incomplete_resume_record")
        if any(previous[field] != evidence.get(field)
               for field in ("repository", "issue", "execution_url", "branch", "pr", "base")):
            return result("blocked", "reacquire", "resume_identity_mismatch")
        if not valid_round(evidence["review_round"]) or evidence["review_round"] != previous["review_round"]:
            return result("blocked", "reacquire", "review_round_changed")
        if evidence["head"] != previous["head"]:
            return result("blocked", "reverify_head", "stale_head")

    approval = change_approval(evidence, [evidence.get("scenario")])
    if approval:
        return approval
    return result("ready", "continue_task" if active or evidence["resumed"] else "delegate", "startup_checked")


def quality(evidence: dict) -> dict:
    """同じ最終headのCI/独立レビュー/preview/E2Eと対象シナリオを照合する。"""
    if any(not nonempty(evidence.get(key)) for key in ("repository", "branch")):
        return result("blocked", "reacquire", "missing_quality_identity")
    head = evidence["head"]
    if not valid_sha(head) or not valid_sha(evidence["base"]):
        return result("blocked", "reacquire", "invalid_head")
    ci = evidence["ci"]
    if ci.get("sha") != head or ci.get("status") != "success" or not nonempty(ci.get("run_url")):
        return result("blocked", "verify_ci", "ci_incomplete_or_wrong_head")
    reviews = evidence["reviews"]
    if (not valid_round(evidence["review_round"]) or evidence["review_round"] == 0 or len(reviews) != 3
            or {review["aspect"] for review in reviews} != ASPECTS
            or len({review["reviewer"] for review in reviews}) != 3):
        return result("blocked", "stop_review", "incomplete_review_panel")
    if any(not nonempty(review.get("reviewer")) or review.get("independent") is not True
           or review.get("status") != "completed" or review.get("head") != head
           or review.get("base") != evidence["base"]
           or any(type(review.get(priority)) is not int or review[priority] != 0
                  for priority in ("p0", "p1", "unclassified"))
           for review in reviews):
        return result("blocked", "stop_review", "review_incomplete_or_unresolved")

    preview = evidence["preview"]
    if (preview.get("sha") != head or preview.get("status") != "success"
            or not nonempty(preview.get("url")) or not nonempty(preview.get("deployment_url"))):
        return result("blocked", "await_preview", "preview_incomplete_or_wrong_head")
    scenarios = evidence["scenarios"]
    approval = change_approval(evidence, scenarios)
    if approval:
        return approval
    if (not valid_scenario_targets(scenarios)
            or len({scenario["id"] for scenario in scenarios}) != len(scenarios)):
        return result("blocked", "verify_e2e", "invalid_scenario_mapping")
    e2e = evidence["e2e"]
    if e2e.get("status") == "not_run":
        return result("waiting", "request_approved_e2e", "e2e_not_run")
    expected = {scenario["id"]: scenario["version"] for scenario in scenarios}
    if (e2e.get("status") != "success" or e2e.get("sha") != head
            or e2e.get("url") != preview["url"] or not nonempty(e2e.get("run_url"))
            or e2e.get("scenarios") != expected):
        return result("blocked", "verify_e2e", "e2e_incomplete_or_target_mismatch")
    permission = evidence.get("merge_permission", {})
    if (permission.get("current") is True and nonempty(permission.get("source"))
            and permission.get("repository") == evidence["repository"]
            and permission.get("branch") == evidence["branch"]):
        return result("ready", "merge_eligible", "quality_checked_permission_supplied")
    return result("ready", "report_only", "quality_checked_no_current_merge_permission")


def vote(evidence: dict) -> dict:
    """同じ候補/版の独立5担当全票を確認する。起票済みは再投票しない。"""
    if evidence.get("issue_url"):
        if not nonempty(evidence["issue_url"]):
            return result("blocked", "correct_input", "invalid_existing_issue")
        return result("existing", "reuse_issue", "already_issued")
    target = evidence["target"]
    if not valid_target(target) or not nonempty(target.get("version")):
        return result("blocked", "correct_input", "invalid_vote_target")
    voters, ballots = evidence["voters"], evidence["ballots"]
    if (not isinstance(voters, list) or not isinstance(ballots, list)
            or len(voters) != 5 or len(set(voters)) != 5 or any(not nonempty(voter) for voter in voters)
            or len(ballots) != 5 or any(not isinstance(ballot, dict) for ballot in ballots)
            or {ballot["voter"] for ballot in ballots} != set(voters)):
        return result("blocked", "complete_vote", "invalid_or_duplicate_voters")
    if any(ballot.get("status") != "completed" or ballot.get("independent") is not True
           or ballot.get("target") != target or not nonempty(ballot.get("reason"))
           or ballot.get("decision") not in ("yes", "no") for ballot in ballots):
        return result("blocked", "complete_vote", "incomplete_or_wrong_target_ballot")
    approvals = sum(ballot["decision"] == "yes" for ballot in ballots)
    decision = result("accepted" if approvals >= 3 else "rejected",
                      "check_duplicate_issue" if approvals >= 3 else "record_reasons", "vote_checked")
    decision.update(approvals=approvals, ballots=ballots)
    return decision


def weekly(evidence: dict) -> dict:
    """同repo/週/系統のDiscussionを再利用し、候補ID/版は個別に引き継ぐ。"""
    target = evidence["target"]
    if not valid_target(target) or not nonempty(target.get("version")):
        return result("blocked", "correct_input", "invalid_weekly_target")
    if evidence.get("send_status") == "unknown":
        return result("blocked", "reacquire", "unknown_send")
    if evidence.get("send_status") not in ("not_sent", "confirmed"):
        return result("blocked", "correct_input", "invalid_send_status")
    existing = evidence["existing"]
    if not isinstance(existing, list):
        return result("blocked", "reacquire", "invalid_weekly_records")
    scope = ("repository", "week_start", "week_end", "timezone", "stream")
    if any(not valid_target(record["target"]) or not nonempty(record["target"].get("version"))
           or any(record["target"][field] != target[field] for field in scope)
           or not nonempty(record.get("discussion_url")) for record in existing):
        return result("blocked", "reacquire", "weekly_identity_mismatch")
    discussion_urls = {record["discussion_url"] for record in existing}
    if len(discussion_urls) > 1:
        return result("blocked", "reconcile_records", "duplicate_discussions")

    candidate_records = [record for record in existing
                         if record["target"]["candidate_id"] == target["candidate_id"]]
    issue_urls = {record["issue_url"] for record in candidate_records if nonempty(record.get("issue_url"))}
    if nonempty(evidence.get("duplicate_issue_url")):
        issue_urls.add(evidence["duplicate_issue_url"])
    if len(issue_urls) > 1:
        return result("blocked", "reconcile_records", "conflicting_candidate_issues")
    if issue_urls:
        issue_url = next(iter(issue_urls))
        decision = result("existing", "reuse_issue", "same_candidate_issue_exists")
        decision["issue_url"] = issue_url
        return decision
    if existing:
        same_version = any(record["target"]["version"] == target["version"] for record in candidate_records)
        decision = result("existing", "reuse_discussion", "existing_weekly_discussion")
        decision.update(discussion_url=existing[0]["discussion_url"], candidate_action=(
            "reuse_candidate" if same_version else "append_version" if candidate_records else "append_candidate"))
        return decision
    return result("ready", "prepare_discussion", "no_existing_record_supplied")


def effect(evidence: dict) -> dict:
    """事前固定した数値指標だけを比較し、比較不能は同Issueで保留する。"""
    criteria = evidence["before"]["criteria"]
    required = ("metric", "source", "comparison_period", "denominator", "success_condition",
                "worsening_condition", "hold_condition", "direction", "success_delta",
                "worsening_delta", "minimum_samples", "before_period", "after_period")
    if (not evidence.get("issue_url") or evidence["before"].get("recorded_before_execution") is not True
            or any(key not in criteria or criteria[key] in (None, "") for key in required)
            or evidence.get("current_criteria") != criteria):
        return result("held", "append_same_issue_and_recheck", "missing_or_changed_before_criteria")
    baseline, after = evidence["before"], evidence["after"]
    target, implementation = evidence["target"], evidence["implementation"]
    if (any(not nonempty(target.get(key))
            for key in ("repository", "issue", "version"))
            or target["issue"] != evidence["issue_url"]
            or baseline.get("target") != target or after.get("target") != target
            or implementation.get("target") != target or implementation.get("status") != "completed"
            or not valid_sha(implementation.get("commit"))
            or after.get("commit") != implementation["commit"]):
        return result("held", "append_same_issue_and_recheck", "implementation_incomplete_or_wrong_target")
    if (not evidence.get("recheck_target") or not evidence.get("recheck_at")
            or evidence.get("comparable") is not True
            or baseline.get("source") != criteria["source"] or after.get("source") != criteria["source"]
            or baseline.get("denominator") != criteria["denominator"]
            or after.get("denominator") != criteria["denominator"]
            or baseline.get("period") != criteria["before_period"]
            or after.get("period") != criteria["after_period"]):
        return result("held", "append_same_issue_and_recheck", "insufficient_or_incomparable_data")
    numbers = [baseline["value"], after["value"], baseline["samples"], after["samples"],
               criteria["success_delta"], criteria["worsening_delta"], criteria["minimum_samples"]]
    if (any(isinstance(number, bool) or not isinstance(number, (int, float))
            or not math.isfinite(number) for number in numbers)
            or any(type(value) is not int for value in
                   (baseline["samples"], after["samples"], criteria["minimum_samples"]))
            or criteria["minimum_samples"] <= 0 or criteria["success_delta"] <= 0
            or criteria["worsening_delta"] <= 0
            or min(baseline["samples"], after["samples"]) < criteria["minimum_samples"]):
        return result("held", "append_same_issue_and_recheck", "insufficient_or_invalid_measurements")
    if criteria["direction"] not in ("lower", "higher"):
        return result("held", "append_same_issue_and_recheck", "unsupported_metric_direction")
    improvement = after["value"] - baseline["value"]
    if criteria["direction"] == "lower":
        improvement *= -1
    outcome = ("success" if improvement >= criteria["success_delta"] else
               "worsened" if improvement <= -criteria["worsening_delta"] else "held")
    return result(outcome, "append_same_issue_and_recheck" if outcome == "held" else "append_same_issue",
                  "compared_with_frozen_criteria")


def change_approval(evidence: dict, scenarios):
    """本人承認の要否を起動と品質判定で共有する。動作変更はspecificationへ分類する。"""
    change_type = evidence["change_type"]
    if change_type in ("bug", "refactor"):
        if not valid_scenario_targets(scenarios):
            return result("blocked", "correct_input", "invalid_scenario_mapping")
        if not nonempty(evidence.get("specification_evidence")):
            return result("waiting", "clarify", "ambiguous_existing_behavior")
        return None
    if change_type not in ("feature", "specification"):
        return result("blocked", "correct_input", "invalid_change_type")
    if (not isinstance(scenarios, list) or not scenarios
            or any(not isinstance(scenario, dict) or scenario.get("approved") is not True
                   or any(not nonempty(scenario.get(field))
                          for field in ("id", "version", "approved_version", "approval_source"))
                   or scenario["version"] != scenario["approved_version"] for scenario in scenarios)):
        return result("waiting", "wait_approval", "scenario_unapproved")
    return None


def valid_scenario_targets(scenarios) -> bool:
    return (isinstance(scenarios, list) and bool(scenarios)
            and all(isinstance(scenario, dict) and nonempty(scenario.get("id"))
                    and nonempty(scenario.get("version")) for scenario in scenarios))


def valid_resume_record(record) -> bool:
    if not isinstance(record, dict) or any(record.get(field) is None for field in RESUME_FIELDS):
        return False
    identities = ("repository", "issue", "execution_url", "branch", "pr", "base", "head", "approval_target")
    if any(not nonempty(record[field]) for field in identities):
        return False
    if any(not isinstance(record[field], str) for field in ("stage", "stop_reason")):
        return False
    return (all(isinstance(record[field], list) and all(nonempty(item) for item in record[field])
                for field in ("questions", "records")) and valid_round(record["review_round"]))


def result(status: str, action: str, reason: str) -> dict:
    return {"status": status, "action": action, "reasons": [reason]}


def nonempty(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def valid_sha(value) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{40}", value) is not None


def valid_round(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 3


def valid_target(target: dict) -> bool:
    fields = ("repository", "week_start", "week_end", "timezone", "stream", "candidate_id")
    if any(not nonempty(target.get(field)) for field in fields):
        return False
    return (date.fromisoformat(target["week_start"]) <= date.fromisoformat(target["week_end"])
            and target["stream"] in ("bug", "refactor", "improvement"))


def fixture_input(fixtures: dict, case: dict) -> dict:
    """共通入力から明示パスの値だけを変え、合成ケースを再現する。"""
    evidence = copy.deepcopy(fixtures["inputs"][case["input"]])
    for change in case.get("changes", []):
        parent = evidence
        for key in change["path"][:-1]:
            parent = parent[key]
        parent[change["path"][-1]] = change["value"]
    return evidence


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path, help="判定入力JSON、または --fixtures 時の cases JSON")
    parser.add_argument("--fixtures", action="store_true", help="各caseの期待status/actionを実判定と照合")
    arguments = parser.parse_args()
    try:
        evidence = json.loads(arguments.path.read_text(encoding="utf-8"))
        if arguments.fixtures:
            checks = [{"name": case["name"], "actual": evaluate(fixture_input(evidence, case)),
                       "expected": case["expected"]} for case in evidence["cases"]]
            for check in checks:
                check["passed"] = all(check["actual"].get(key) == value
                                      for key, value in check["expected"].items())
            print(json.dumps(checks, ensure_ascii=False, indent=2))
            return 0 if checks and all(check["passed"] for check in checks) else 1
        print(json.dumps(evaluate(evidence), ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(2, f"入力を確認してください: {type(error).__name__}\n")


if __name__ == "__main__":
    raise SystemExit(main())
