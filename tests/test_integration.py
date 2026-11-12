"""Full lifecycle integration test (deterministic, in-process).

Covers two cases end to end: fast acceptance and a disputed case that goes
through adjudication, appeal window, settlement, and readable JSON output.
"""

import json

from tests.helpers import (
    DELIVERY_DEADLINE,
    EVIDENCE_URL,
    REWARD,
    RUBRIC,
    SPEC_URL,
    VERDICT_REQUESTER,
    delivered_case,
    disputed_case,
    mock_verdict,
    open_case,
    register_provider,
)


def test_full_lifecycle_two_cases(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob, stake=2000)

    # Case 1: requester accepts the delivery, no AI involved.
    case_one = open_case(court, direct_vm, alice, bob)
    direct_vm.sender = bob
    court.accept_case(case_one)
    direct_vm.sender = bob
    court.deliver_case(case_one, EVIDENCE_URL)
    direct_vm.sender = alice
    court.accept_delivery(case_one)

    # Case 2: dispute reaches adjudication and settlement.
    case_two = disputed_case(court, direct_vm, alice, bob)
    mock_verdict(direct_vm, VERDICT_REQUESTER, 10000, score=95)
    direct_vm.sender = alice
    court.adjudicate(case_two)

    direct_vm.warp("2100-06-01T00:00:00Z")
    court.finalize_case(case_two)

    assert int(court.get_case_count()) == 2
    assert int(court.get_escrow_total()) == 0
    assert int(court.get_credits_total()) == 2 * REWARD
    assert int(court.get_credit_of(bob)) == 2 * REWARD
    assert int(court.get_credit_of(alice)) == 0
    assert int(court.get_stakes_total()) == 2000
    assert int(court.get_agent_active_cases(bob)) == 0
    assert court.get_agent_stats(bob) == "2|2|0"

    first = json.loads(court.get_case_json(case_one))
    second = json.loads(court.get_case_json(case_two))

    assert first["status"] == "SETTLED"
    assert first["verdict"] == "ACCEPTED"
    assert first["credit_provider"] == REWARD

    assert second["status"] == "SETTLED"
    assert second["verdict"] == VERDICT_REQUESTER
    assert second["award_bps"] == 10000
    assert len(second["criteria"]) == 2
    assert second["adjudicated_ts"] > 0
    assert second["settled_ts"] >= second["adjudicated_ts"]


def test_open_case_after_settlement_keeps_accounting(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)

    first = delivered_case(court, direct_vm, alice, bob)
    direct_vm.sender = alice
    court.accept_delivery(first)

    second = disputed_case(court, direct_vm, alice, bob)
    mock_verdict(direct_vm, VERDICT_REQUESTER, 10000, score=95)
    direct_vm.sender = alice
    court.adjudicate(second)

    assert int(court.get_escrow_total()) == REWARD

    direct_vm.warp("2100-06-01T00:00:00Z")
    court.finalize_case(second)

    assert int(court.get_escrow_total()) == 0
    assert int(court.get_credits_total()) == 2 * REWARD
    assert int(court.get_credit_of(bob)) == 2 * REWARD


def test_delivery_deadline_is_recorded_and_cases_are_isolated(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)

    case_one = delivered_case(court, direct_vm, alice, bob)
    case_two = delivered_case(court, direct_vm, alice, bob)

    assert case_one != case_two
    assert court.get_case_rubric(case_one) == RUBRIC
    assert int(court.get_escrow_total()) == 2 * REWARD
    assert int(court.get_agent_active_cases(bob)) == 2

    deadlines = court.get_case_deadlines(case_one).split("|")
    assert int(deadlines[0]) == DELIVERY_DEADLINE
