"""Shared fixtures and helpers for Vonis direct-mode tests."""

import pytest

from gltest.direct import create_address


@pytest.fixture
def court(direct_vm, direct_deploy, direct_owner):
    """Deploy Vonis with direct_owner as the deploying judge."""
    direct_vm.sender = direct_owner
    return direct_deploy("contracts/vonis.py")


@pytest.fixture
def alice(direct_vm, court):
    """Requester address (created after deployment so it is a real Address)."""
    return create_address("alice")


@pytest.fixture
def bob(direct_vm, court):
    """Provider address."""
    return create_address("bob")


@pytest.fixture
def carol(direct_vm, court):
    """Unrelated third party."""
    return create_address("carol")
