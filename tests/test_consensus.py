"""Validator consensus: what the court's validators accept and reject."""

from tests.helpers import (
    VERDICT_PROVIDER,
    VERDICT_REQUESTER,
    VERDICT_SHARED,
    adjudicated_case,
    mock_verdict,
)


def test_validator_agrees_with_identical_output(court, direct_vm, alice, bob):
    adjudicated_case(court, direct_vm, alice, bob, VERDICT_REQUESTER, 10000, score=95)

    assert direct_vm.run_validator() is True


def test_validator_rejects_different_verdict(court, direct_vm, alice, bob):
    adjudicated_case(court, direct_vm, alice, bob, VERDICT_REQUESTER, 10000, score=95)

    direct_vm.clear_mocks()
    mock_verdict(direct_vm, VERDICT_PROVIDER, 1000, score=30, met=(True, False))

    assert direct_vm.run_validator() is False


def test_validator_accepts_small_score_difference(court, direct_vm, alice, bob):
    adjudicated_case(court, direct_vm, alice, bob, VERDICT_REQUESTER, 10000, score=95)

    direct_vm.clear_mocks()
    mock_verdict(direct_vm, VERDICT_REQUESTER, 9200, score=88)

    assert direct_vm.run_validator() is True


def test_validator_rejects_large_score_gap(court, direct_vm, alice, bob):
    adjudicated_case(court, direct_vm, alice, bob, VERDICT_REQUESTER, 10000, score=95)

    direct_vm.clear_mocks()
    mock_verdict(direct_vm, VERDICT_REQUESTER, 10000, score=50)

    assert direct_vm.run_validator() is False


def test_validator_rejects_award_gap(court, direct_vm, alice, bob):
    adjudicated_case(court, direct_vm, alice, bob, VERDICT_SHARED, 5000, score=90)

    direct_vm.clear_mocks()
    mock_verdict(direct_vm, VERDICT_SHARED, 8999, score=90)

    assert direct_vm.run_validator() is False


def test_validator_rejects_criteria_mismatch(court, direct_vm, alice, bob):
    adjudicated_case(
        court, direct_vm, alice, bob, VERDICT_REQUESTER, 10000, score=95, met=(True, True)
    )

    direct_vm.clear_mocks()
    mock_verdict(
        direct_vm, VERDICT_REQUESTER, 10000, score=95, met=(True, False)
    )

    assert direct_vm.run_validator() is False


def test_validator_rejects_injection_flag_mismatch(court, direct_vm, alice, bob):
    adjudicated_case(
        court, direct_vm, alice, bob, VERDICT_REQUESTER, 10000, score=95, injection=False
    )

    direct_vm.clear_mocks()
    mock_verdict(
        direct_vm, VERDICT_REQUESTER, 10000, score=95, injection=True
    )

    assert direct_vm.run_validator() is False


def test_validator_rejects_when_leader_errored(court, direct_vm, alice, bob):
    adjudicated_case(court, direct_vm, alice, bob, VERDICT_REQUESTER, 10000, score=95)

    assert direct_vm.run_validator(leader_error=ValueError("timeout")) is False
