"""Agent registry and stake accounting."""

from tests.helpers import open_case, register_provider


def test_register_agent_sets_default_reputation(court, direct_vm, bob):
    direct_vm.sender = bob
    court.register_agent("agent-bob", "https://bob.example")

    assert court.get_agent_handle(bob) == "agent-bob"
    assert int(court.get_agent_score(bob)) == 50
    assert court.get_agent_stats(bob) == "0|0|0"
    assert int(court.get_agent_stake(bob)) == 0


def test_register_agent_requires_handle(court, direct_vm, bob):
    direct_vm.sender = bob
    with direct_vm.expect_revert("handle required"):
        court.register_agent("", "https://bob.example")


def test_register_agent_twice_updates_profile_not_score(court, direct_vm, bob):
    direct_vm.sender = bob
    court.register_agent("agent-bob", "https://bob.example")
    court.register_agent("bob-v2", "https://bob.example/v2")

    assert court.get_agent_handle(bob) == "bob-v2"
    assert int(court.get_agent_score(bob)) == 50


def test_deposit_and_withdraw_stake(court, direct_vm, bob):
    direct_vm.sender = bob
    court.register_agent("agent-bob", "https://bob.example")

    direct_vm.value = 500
    court.deposit_stake()
    direct_vm.value = 0

    assert int(court.get_agent_stake(bob)) == 500
    assert int(court.get_stakes_total()) == 500

    court.withdraw_stake(200)

    assert int(court.get_agent_stake(bob)) == 300
    assert int(court.get_stakes_total()) == 300
    assert int(court.get_credit_of(bob)) == 200
    assert int(court.get_credits_total()) == 200


def test_deposit_stake_requires_registration(court, direct_vm, bob):
    direct_vm.sender = bob
    direct_vm.value = 500
    with direct_vm.expect_revert("agent not registered"):
        court.deposit_stake()
    direct_vm.value = 0


def test_deposit_stake_requires_value(court, direct_vm, bob):
    direct_vm.sender = bob
    court.register_agent("agent-bob", "https://bob.example")

    direct_vm.value = 0
    with direct_vm.expect_revert("stake required"):
        court.deposit_stake()


def test_withdraw_more_than_stake_reverts(court, direct_vm, bob):
    register_provider(court, direct_vm, bob, stake=100)

    with direct_vm.expect_revert("amount exceeds stake"):
        court.withdraw_stake(101)


def test_withdraw_stake_blocked_while_agent_has_active_case(court, direct_vm, alice, bob):
    register_provider(court, direct_vm, bob, stake=500)
    open_case(court, direct_vm, alice, bob)

    direct_vm.sender = bob
    with direct_vm.expect_revert("active cases"):
        court.withdraw_stake(200)


def test_withdraw_requires_credit(court, direct_vm, bob):
    direct_vm.sender = bob
    with direct_vm.expect_revert("nothing to withdraw"):
        court.withdraw()
