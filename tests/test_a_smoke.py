"""Smoke test: proves the direct runner itself can load a minimal contract.

Runs first (file name sorts before the rest) so a runner/environment failure is
distinguishable from a failure inside the Vonis contract module.
"""


def test_minimal_contract_loads(direct_deploy):
    ping = direct_deploy("tests/fixtures/ping.py")
    assert ping.get_value() == "pong"
