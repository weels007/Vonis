"""Deterministic case state machine: open, accept, deliver, dispute, cancel."""

from tests.helpers import (
    CLAIM,
    DELIVERY_DEADLINE,
    EVIDENCE_URL,
    REWARD,
    RUBRIC,
    SPEC_URL,
    accepted_case,
    delivered_case,
    open_case,
    register_provider,
)


def test_open_case_locks_reward(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)

    case_id = open_case(court, direct_vm, alice, bob)

    assert case_id == "case-0"
    assert court.get_case_status(case_id) == "OPEN"
    assert court.get_case_verdict(case_id) == ""
    assert int(court.get_case_award_bps(case_id)) == 0
    assert int(court.get_escrow_total()) == REWARD
    assert int(court.get_case_count()) == 1
    assert int(court.get_agent_active_cases(bob)) == 1


def test_open_case_requires_reward(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)

    direct_vm.sender = alice
    direct_vm.value = 0
    with direct_vm.expect_revert("reward required"):
        court.open_case(bob, "Landing page", SPEC_URL, RUBRIC, DELIVERY_DEADLINE)


def test_open_case_requires_registered_provider(court, direct_vm, alice, bob):
    direct_vm.sender = alice
    direct_vm.value = REWARD
    with direct_vm.expect_revert("agent not registered"):
        court.open_case(bob, "Landing page", SPEC_URL, RUBRIC, DELIVERY_DEADLINE)
    direct_vm.value = 0


def test_open_case_rejects_self_engagement(court, direct_vm, alice):
    direct_vm.sender = alice
    court.register_agent("agent-alice", "https://alice.example")

    direct_vm.value = REWARD
    with direct_vm.expect_revert("self engagement"):
        court.open_case(alice, "Landing page", SPEC_URL, RUBRIC, DELIVERY_DEADLINE)
    direct_vm.value = 0


def test_open_case_rejects_past_deadline(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)

    direct_vm.sender = alice
    direct_vm.value = REWARD
    with direct_vm.expect_revert("deadline in past"):
        court.open_case(bob, "Landing page", SPEC_URL, RUBRIC, 1)
    direct_vm.value = 0


def test_open_case_rejects_non_http_spec_url(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)

    direct_vm.sender = alice
    direct_vm.value = REWARD
    with direct_vm.expect_revert("bad spec url"):
        court.open_case(bob, "Landing page", "ipfs://spec", RUBRIC, DELIVERY_DEADLINE)
    direct_vm.value = 0


def test_case_records_origin_address(court, direct_vm, alice, bob, carol):
    register_provider(court, direct_vm, bob)

    # Simulate an agent framework calling on behalf of the requester.
    direct_vm.origin = carol
    case_id = open_case(court, direct_vm, alice, bob)

    origin = court.get_case_origin(case_id)
    requester_hex = court.get_case_parties(case_id).split("|")[0]

    assert origin != ""
    assert origin == court.get_case_origin(case_id)
    assert origin != requester_hex


def test_stray_value_is_rejected(court, direct_vm, carol):
    direct_vm.sender = carol
    direct_vm.value = 500
    with direct_vm.expect_revert("use open_case or deposit_stake"):
        court.__receive__()
    direct_vm.value = 0


def test_accept_case_only_by_provider(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = open_case(court, direct_vm, alice, bob)

    direct_vm.sender = alice
    with direct_vm.expect_revert("only provider"):
        court.accept_case(case_id)


def test_accept_case_marks_accepted(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = open_case(court, direct_vm, alice, bob)

    direct_vm.sender = bob
    court.accept_case(case_id)

    assert court.get_case_status(case_id) == "ACCEPTED"

    with direct_vm.expect_revert("case not open"):
        court.accept_case(case_id)


def test_accept_case_after_deadline_reverts(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = open_case(court, direct_vm, alice, bob)

    direct_vm.warp("2100-06-01T00:00:00Z")
    direct_vm.sender = bob
    with direct_vm.expect_revert("delivery deadline passed"):
        court.accept_case(case_id)


def test_deliver_case_only_by_provider(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = accepted_case(court, direct_vm, alice, bob)

    direct_vm.sender = alice
    with direct_vm.expect_revert("only provider"):
        court.deliver_case(case_id, EVIDENCE_URL)


def test_deliver_case_rejects_bad_url(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = accepted_case(court, direct_vm, alice, bob)

    direct_vm.sender = bob
    with direct_vm.expect_revert("bad evidence url"):
        court.deliver_case(case_id, "ftp://example.com/delivery")


def test_deliver_case_rejects_too_many_urls(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = accepted_case(court, direct_vm, alice, bob)

    direct_vm.sender = bob
    with direct_vm.expect_revert("too many evidence urls"):
        court.deliver_case(
            case_id,
            "https://a.example/1\nhttps://a.example/2\nhttps://a.example/3\nhttps://a.example/4",
        )


def test_deliver_after_deadline_reverts(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = accepted_case(court, direct_vm, alice, bob)

    direct_vm.warp("2100-06-01T00:00:00Z")
    direct_vm.sender = bob
    with direct_vm.expect_revert("delivery deadline passed"):
        court.deliver_case(case_id, EVIDENCE_URL)


def test_accept_delivery_settles_full_reward(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = delivered_case(court, direct_vm, alice, bob)

    direct_vm.sender = alice
    court.accept_delivery(case_id)

    assert court.get_case_status(case_id) == "SETTLED"
    assert court.get_case_verdict(case_id) == "ACCEPTED"
    assert int(court.get_case_score(case_id)) == 100
    assert court.get_case_payouts(case_id) == "1000|0|0"
    assert int(court.get_credit_of(bob)) == 1000
    assert int(court.get_credit_of(alice)) == 0
    assert int(court.get_escrow_total()) == 0
    assert int(court.get_credits_total()) == 1000
    assert int(court.get_agent_active_cases(bob)) == 0
    assert court.get_agent_stats(bob) == "1|1|0"
    assert int(court.get_agent_score(bob)) == 55


def test_accept_delivery_only_by_requester(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = delivered_case(court, direct_vm, alice, bob)

    direct_vm.sender = bob
    with direct_vm.expect_revert("only requester"):
        court.accept_delivery(case_id)


def test_cancel_case_refunds_requester(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = open_case(court, direct_vm, alice, bob)

    direct_vm.sender = alice
    court.cancel_case(case_id)

    assert court.get_case_status(case_id) == "SETTLED"
    assert court.get_case_verdict(case_id) == "CANCELLED"
    assert court.get_case_payouts(case_id) == "0|1000|0"
    assert int(court.get_credit_of(alice)) == REWARD
    assert int(court.get_escrow_total()) == 0
    assert int(court.get_agent_score(bob)) == 50
    assert int(court.get_agent_active_cases(bob)) == 0


def test_cancel_case_only_by_requester(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = open_case(court, direct_vm, alice, bob)

    direct_vm.sender = bob
    with direct_vm.expect_revert("only requester"):
        court.cancel_case(case_id)


def test_deliver_requires_accepted_case(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = open_case(court, direct_vm, alice, bob)

    direct_vm.sender = bob
    with direct_vm.expect_revert("case not accepted"):
        court.deliver_case(case_id, EVIDENCE_URL)


def test_cancel_after_delivery_reverts(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    case_id = delivered_case(court, direct_vm, alice, bob)

    direct_vm.sender = alice
    with direct_vm.expect_revert("case cannot be cancelled"):
        court.cancel_case(case_id)


def test_dispute_window_closes(court, direct_vm, alice, bob):
    direct_vm.warp("2099-12-01T00:00:00Z")
    register_provider(court, direct_vm, bob)
    delivered_case(court, direct_vm, alice, bob)

    direct_vm.warp("2099-12-10T00:00:00Z")
    direct_vm.sender = alice
    with direct_vm.expect_revert("dispute window closed"):
        court.raise_dispute("case-0", CLAIM)


def test_raise_dispute_only_by_parties(court, direct_vm, alice, bob, carol):
    register_provider(court, direct_vm, bob)
    delivered_case(court, direct_vm, alice, bob)

    direct_vm.sender = carol
    with direct_vm.expect_revert("not a party"):
        court.raise_dispute("case-0", CLAIM)


def test_raise_dispute_requires_claim(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    delivered_case(court, direct_vm, alice, bob)

    direct_vm.sender = alice
    with direct_vm.expect_revert("bad claim"):
        court.raise_dispute("case-0", "")


def test_provider_can_escalate_unpaid_delivery(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob)
    delivered_case(court, direct_vm, alice, bob)

    direct_vm.warp("2100-06-01T00:00:00Z")
    direct_vm.sender = bob
    court.raise_dispute("case-0", "Requester never accepted the delivery.")

    assert court.get_case_status("case-0") == "DISPUTED"


def test_unknown_case_is_rejected(court, direct_vm, alice):
    direct_vm.sender = alice
    with direct_vm.expect_revert("case not found"):
        court.get_case_status("case-404")
