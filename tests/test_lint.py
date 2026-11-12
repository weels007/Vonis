"""Static lint checks for the Intelligent Contract source.

Runs without the GenVM SDK, so structural regressions fail CI immediately
rather than at deploy time. These encode the contract's own rules:

* deterministic code never calls gl.nondet directly;
* the nondeterministic leader block never writes storage or emits messages;
* storage fields use GenVM collection types, not plain Python collections;
* the case record keeps the fields the frontend reads.
"""

import ast
from pathlib import Path

CONTRACT_PATH = Path(__file__).resolve().parents[1] / "contracts" / "vonis.py"

PLAIN_COLLECTIONS = ("list", "dict", "set", "tuple", "frozenset")


def _tree():
    return ast.parse(CONTRACT_PATH.read_text(encoding="utf-8"))


def _dotted(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = _dotted(node.value)
        return base + "." + node.attr if base else node.attr
    return ""


def _decorators(node):
    return [_dotted(item) for item in node.decorator_list]


def test_contract_declares_dependency_header():
    first_line = CONTRACT_PATH.read_text(encoding="utf-8").splitlines()[0]
    assert first_line.startswith("# {")
    assert '"Depends"' in first_line


def test_storage_fields_use_genvm_collections():
    for node in ast.walk(_tree()):
        if not isinstance(node, ast.ClassDef):
            continue
        for stmt in node.body:
            if isinstance(stmt, ast.AnnAssign):
                annotation = ast.unparse(stmt.annotation)
                root = annotation.split("[")[0].strip()
                assert root not in PLAIN_COLLECTIONS, (
                    node.name + " field uses " + annotation
                )


def test_deterministic_methods_do_not_call_nondet():
    for node in ast.walk(_tree()):
        if not isinstance(node, ast.FunctionDef):
            continue
        is_public = any(d.startswith("gl.public") for d in _decorators(node))
        if not is_public:
            continue
        for child in ast.walk(node):
            if isinstance(child, ast.Call) and _dotted(child.func).startswith("gl.nondet."):
                raise AssertionError(
                    "gl.nondet call in deterministic method " + node.name
                )


def test_leader_block_has_no_side_effects():
    for node in ast.walk(_tree()):
        if not isinstance(node, ast.FunctionDef) or node.name != "leader_fn":
            continue
        for child in ast.walk(node):
            if isinstance(child, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                if isinstance(child, ast.Assign):
                    targets = child.targets
                else:
                    targets = [child.target]
                for target in targets:
                    if (
                        isinstance(target, ast.Attribute)
                        and isinstance(target.value, ast.Name)
                        and target.value.id == "self"
                    ):
                        raise AssertionError("leader_fn must not write storage")
            if isinstance(child, ast.Call) and _dotted(child.func).endswith(
                ("emit", "emit_transfer")
            ):
                raise AssertionError("leader_fn must not emit messages")


def test_case_records_frontend_fields():
    for node in ast.walk(_tree()):
        if not isinstance(node, ast.ClassDef) or node.name != "Case":
            continue
        fields = {
            stmt.target.id for stmt in node.body if isinstance(stmt, ast.AnnAssign)
        }
        required = {"requester", "provider", "origin", "criteria_report", "submitted_ts"}
        missing = required - fields
        assert not missing, "Case is missing fields: " + ", ".join(sorted(missing))
        return
    raise AssertionError("Case dataclass not found")


def test_receive_handler_is_payable():
    for node in ast.walk(_tree()):
        if not isinstance(node, ast.ClassDef):
            continue
        for stmt in node.body:
            if isinstance(stmt, ast.FunctionDef) and stmt.name == "__receive__":
                assert "gl.public.write.payable" in _decorators(stmt)
                return
    raise AssertionError("__receive__ not found")


def test_storage_maps_are_read_with_a_default():
    """GenVM's TreeMap.get requires a default argument.

    Direct mode tolerates ``self.agents.get(who)``, but the node raises on it,
    so storage reads use membership plus indexing instead. This guard keeps a
    one-argument ``.get()`` from slipping back in.
    """
    for node in ast.walk(_tree()):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not isinstance(func, ast.Attribute) or func.attr != "get":
            continue
        owner = func.value
        if not isinstance(owner, ast.Attribute) or owner.attr not in (
            "cases",
            "agents",
            "credits",
        ):
            continue
        if len(node.args) < 2 and not node.keywords:
            raise AssertionError(
                "TreeMap.get without a default at contracts/vonis.py:" + str(node.lineno)
            )
