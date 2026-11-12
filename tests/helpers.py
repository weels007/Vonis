"""Helpers shared by the Vonis test suite."""

import json

REWARD = 1000
DELIVERY_DEADLINE = 4102444800  # 2100-01-01T00:00:00Z, far future
SPEC_URL = "https://example.com/brief"
EVIDENCE_URL = "https://example.com/delivery"
RUBRIC = "1. Hero section has a CTA button\n2. Layout is mobile responsive"
CLAIM = "The hero has no CTA and the layout breaks on mobile."

VERDICT_PROVIDER = "PROVIDER_AT_FAULT"
VERDICT_REQUESTER = "REQUESTER_AT_FAULT"
VERDICT_SHARED = "SHARED"
VERDICT_UNVERIFIABLE = "UNVERIFIABLE"


def register_provider(court, direct_vm, provider, handle="agent-bob", stake=0):
    direct_vm.sender = provider
    court.register_agent(handle, "https://agent.example")
    if stake > 0:
        direct_vm.value = stake
        court.deposit_stake()
        direct_vm.value = 0


def open_case(court, direct_vm, requester, provider, reward=REWARD, spec_url=SPEC_URL):
    direct_vm.sender = requester
    direct_vm.value = reward
    case_id = court.open_case(
        provider,
        "Landing page build",
        spec_url,
        RUBRIC,
        DELIVERY_DEADLINE,
    )
    direct_vm.value = 0
    return case_id


def accepted_case(court, direct_vm, requester, provider, reward=REWARD):
    case_id = open_case(court, direct_vm, requester, provider, reward)
    direct_vm.sender = provider
    court.accept_case(case_id)
    return case_id


def delivered_case(court, direct_vm, requester, provider, reward=REWARD):
    case_id = accepted_case(court, direct_vm, requester, provider, reward)
    direct_vm.sender = provider
    court.deliver_case(case_id, EVIDENCE_URL)
    return case_id


def disputed_case(court, direct_vm, requester, provider, reward=REWARD):
    case_id = delivered_case(court, direct_vm, requester, provider, reward)
    direct_vm.sender = requester
    court.raise_dispute(case_id, CLAIM)
    return case_id


def verdict_json(verdict, award_bps, score=90, met=(True, True), injection=False):
    return json.dumps(
        {
            "verdict": verdict,
            "award_bps": award_bps,
            "score": score,
            "criteria": [{"id": i + 1, "met": bool(item)} for i, item in enumerate(met)],
            "summary": "Ringkasan penilaian untuk pengujian.",
            "injection_suspected": injection,
        }
    )


def mock_sources(direct_vm, brief_status=200, evidence_status=200):
    direct_vm.mock_web(
        r"example\.com/brief",
        {
            "status": brief_status,
            "body": "Build a landing page. Hero must contain a CTA. Mobile layout must be responsive.",
        },
    )
    direct_vm.mock_web(
        r"example\.com/delivery",
        {"status": evidence_status, "body": "Landing page with hero CTA and responsive mobile layout."},
    )


def mock_verdict(direct_vm, verdict, award_bps, score=90, met=(True, True), injection=False):
    mock_sources(direct_vm)
    direct_vm.mock_llm(r".*", verdict_json(verdict, award_bps, score, met, injection))


def adjudicated_case(
    court,
    direct_vm,
    requester,
    provider,
    verdict,
    award_bps,
    score=90,
    met=(True, True),
    injection=False,
    stake=0,
):
    register_provider(court, direct_vm, provider, stake=stake)
    case_id = disputed_case(court, direct_vm, requester, provider)
    mock_verdict(direct_vm, verdict, award_bps, score, met, injection)
    direct_vm.sender = requester
    court.adjudicate(case_id)
    return case_id
