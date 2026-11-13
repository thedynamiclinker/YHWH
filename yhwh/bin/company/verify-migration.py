#!/usr/bin/env python3
"""Check the migrated source inventory and self-contained repository snapshots."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--vault-root", type=Path, default=Path(
    os.environ.get("YHWH_VAULT_ROOT", Path(__file__).resolve().parents[3])))
vault = parser.parse_args().vault_root.resolve()
root = Path(__file__).resolve().parents[2] / "src/company"
inventory = json.loads((root / "reference/migration.json").read_text())
failures = []
for entry in inventory["files"]:
    path = (vault if entry.get("root") == "vault" else root) / entry["destination"]
    expected = entry.get("integrated_sha256", entry["sha256"])
    if not path.is_file():
        failures.append(f"Missing: {entry['destination']}")
        continue
    with path.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != expected:
        failures.append(f"Changed since migration: {entry['destination']}")
    if path.suffix == ".bundle":
        result = subprocess.run(["git", "-C", str(root), "bundle", "verify", str(path)], capture_output=True, text=True)
        if result.returncode:
            failures.append(f"Invalid bundle: {path.name}: {result.stderr.strip()}")
if failures:
    print("\n".join(failures), file=sys.stderr)
    sys.exit(1)
print(f"Verified {len(inventory['files'])} migrated source files and repository bundles.")
