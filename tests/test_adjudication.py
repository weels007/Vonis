"""Adjudication: verdicts, settlement, slashing, appeals, and failure modes."""

import json

from tests.helpers import (
    REWARD,
    VERDICT_PROVIDER,
    VERDICT_REQUESTER,
    VERDICT_SHARED,
    VERDICT_UNVERIFIABLE,
    adjudicated_case,
    disputed_case,
    mock_sources,
    register_provider,
    verdict_json,
)


def test_requester_at_fault_credits_provider(court, direct_vm, alice, bob):
    case_id = adjudicated_case(
        court, direct_vm, alice, bob, VERDICT_REQUESTER, 10000, score=95
    )

    assert court.get_case_status(case_id) == "RULED"
    assert court.get_case_verdict(case_id) == VERDICT_REQUESTER
    assert int(court.get_case_award_bps(case_id)) == 10000
    assert int(court.get_case_score(case_id)) == 95

    with direct_vm.expect_revert("appeal window open"):
        court.finalize_case(case_id)

    direct_vm.warp("2100-06-01T00:00:00Z")
    court.finalize_case(case_id)

    assert court.get_case_status(case_id) == "SETTLED"
    assert court.get_case_payouts(case_id) == "1000|0|0"
    assert int(court.get_credit_of(bob)) == REWARD
    assert int(court.get_credit_of(alice)) == 0
    assert int(court.get_escrow_total()) == 0
    assert int(court.get_credits_total()) == REWARD
    assert int(court.get_agent_score(bob)) == 55
    assert court.get_agent_stats(bob) == "1|1|0"


def test_provider_at_fault_slashes_stake(court, direct_vm, alice, bob):
    case_id = adjudicated_case(
        court,
        direct_vm,
        alice,
        bob,
        VERDICT_PROVIDER,
        2000,
        score=40,
        met=(True, False),
        stake=1000,
    )

    assert court.get_case_verdict(case_id) == VERDICT_PROVIDER
    assert int(court.get_case_award_bps(case_id)) == 2000

    direct_vm.warp("2100-06-01T00:00:00Z")
    court.finalize_case(case_id)

    # 200 to the provider, 800 refunded + 200 slashed stake to the requester.
    assert court.get_case_payouts(case_id) == "200|1000|200"
    assert int(court.get_credit_of(bob)) == 200
    assert int(court.get_credit_of(alice)) == 1000
    assert int(court.get_agent_stake(bob)) == 800
    assert int(court.get_stakes_total()) == 800
    assert int(court.get_agent_score(bob)) == 40
    assert court.get_agent_stats(bob) == "1|0|1"


def test_shared_verdict_splits_reward(court, direct_vm, alice, bob):
    case_id = adjudicated_case(
        court, direct_vm, alice, bob, VERDICT_SHARED, 6000, score=70
    )

    direct_vm.warp("2100-06-01T00:00:00Z")
    court.finalize_case(case_id)

    assert court.get_case_payouts(case_id) == "600|400|0"
    assert int(court.get_credit_of(bob)) == 600
    assert int(court.get_credit_of(alice)) == 400
    assert int(court.get_agent_score(bob)) == 50


def test_unverifiable_requires_judge_decision(court, direct_vm, direct_owner, alice, bob):
    case_id = adjudicated_case(
        court, direct_vm, alice, bob, VERDICT_UNVERIFIABLE, 0, score=0
    )

    assert court.get_case_verdict(case_id) == VERDICT_UNVERIFIABLE

    direct_vm.warp("2100-06-01T00:00:00Z")
    with direct_vm.expect_revert("judge decision required"):
        court.finalize_case(case_id)

    direct_vm.sender = direct_owner
    court.judge_rule(case_id, 7000, "Manual review: most criteria were met.")

    assert court.get_case_status(case_id) == "SETTLED"
    assert court.get_case_verdict(case_id) == "JUDGED"
    assert court.get_case_payouts(case_id) == "700|300|0"


def test_injection_flag_blocks_auto_settlement(court, direct_vm, alice, bob):
    case_id = adjudicated_case(
        court,
        direct_vm,
        alice,
        bob,
        VERDICT_REQUESTER,
        10000,
        score=95,
        injection=True,
    )

    assert court.get_case_verdict(case_id) == VERDICT_UNVERIFIABLE
    assert int(court.get_case_award_bps(case_id)) == 0
    assert "injection" in court.get_case_reasons(case_id)

    direct_vm.warp("2100-06-01T00:00:00Z")
    with direct_vm.expect_revert("judge decision required"):
        court.finalize_case(case_id)


def test_judge_can_override_award_immediately(court, direct_vm, direct_owner, alice, bob):
    case_id = adjudicated_case(
        court, direct_vm, alice, bob, VERDICT_REQUESTER, 10000, score=95
    )

    direct_vm.sender = direct_owner
    court.judge_rule(case_id, 3000, "Partial delivery accepted after manual review.")

    assert court.get_case_status(case_id) == "SETTLED"
    assert court.get_case_payouts(case_id) == "300|700|0"
    assert int(court.get_case_award_bps(case_id)) == 3000


def test_judge_rule_is_restricted_to_judge(court, direct_vm, alice, bob):
    case_id = adjudicated_case(
        court, direct_vm, alice, bob, VERDICT_REQUESTER, 10000, score=95
    )

    direct_vm.sender = alice
    with direct_vm.expect_revert("only judge"):
        court.judge_rule(case_id, 3000, "attempted override")


def test_double_finalize_reverts(court, direct_vm, alice, bob):
    case_id = adjudicated_case(
        court, direct_vm, alice, bob, VERDICT_REQUESTER, 10000, score=95
    )

    direct_vm.warp("2100-06-01T00:00:00Z")
    court.finalize_case(case_id)

    with direct_vm.expect_revert("case is not ruled"):
        court.finalize_case(case_id)


def test_non_party_cannot_adjudicate(court, direct_vm, carol, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = disputed_case(court, direct_vm, alice, bob)

    direct_vm.sender = carol
    with direct_vm.expect_revert("not allowed"):
        court.adjudicate(case_id)


def test_adjudicate_requires_dispute(court, direct_vm, alice, bob):
    from tests.helpers import delivered_case

    register_provider(court, direct_vm, bob)
    case_id = delivered_case(court, direct_vm, alice, bob)

    direct_vm.sender = alice
    with direct_vm.expect_revert("case not disputed"):
        court.adjudicate(case_id)


def test_unknown_verdict_reverts(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = disputed_case(court, direct_vm, alice, bob)

    mock_sources(direct_vm)
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "verdict": "MAYBE",
                "award_bps": 5000,
                "score": 90,
                "criteria": [{"id": 1, "met": True}, {"id": 2, "met": True}],
                "summary": "invalid",
                "injection_suspected": False,
            }
        ),
    )

    direct_vm.sender = alice
    with direct_vm.expect_revert("[LLM_ERROR]"):
        court.adjudicate(case_id)


def test_brief_http_error_is_classified_as_external(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = disputed_case(court, direct_vm, alice, bob)

    mock_sources(direct_vm, brief_status=500)
    direct_vm.mock_llm(r".*", verdict_json(VERDICT_REQUESTER, 10000))

    direct_vm.sender = alice
    with direct_vm.expect_revert("[EXTERNAL]"):
        court.adjudicate(case_id)
