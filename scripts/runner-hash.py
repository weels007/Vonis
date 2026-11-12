"""Print the py-genlayer runner hash bundled with a GenVM release.

The contract header must pin `py-genlayer:<runner-hash>`. The `latest` alias
resolves to the GenVM test runner, which nodes reject outside debug mode
(`:test/:latest runner used in non-debug mode`), so a deploy needs the content
hash the node's GenVM bundle actually ships.

Usage:
    GENVM_VERSION=v0.2.16 GENVM_REPO=genlayerlabs/genvm \
        python scripts/runner-hash.py
"""

import os
import sys

from genvm_linter.validate.artifacts import find_latest_runner, resolve_artifact_source

version = os.environ.get("GENVM_VERSION", "v0.2.16")

try:
    bundle = resolve_artifact_source(version)
except Exception as error:  # diagnostics must not hide the reason
    print(f"could not resolve the GenVM {version} bundle: {error}", file=sys.stderr)
    raise SystemExit(1)

print(f"GenVM {version}: {bundle}")
for name in ("py-genlayer", "py-lib-genlayer-std", "py-lib-protobuf"):
    print(f"{name}:{find_latest_runner(bundle, name) or 'missing'}")
