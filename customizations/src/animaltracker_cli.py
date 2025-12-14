"""
CLI entrypoint for running Animal Tracker sync inside the container.

This exists so Make targets can stay simple while still supporting:
- single DB vs multi DB deployments
- optional alias selection (map/smcom mode)
"""

from __future__ import annotations

import os
import sys

CUSTOM_DIR = os.path.dirname(os.path.abspath(__file__))
ASM3_SRC = os.path.abspath(os.path.join(CUSTOM_DIR, "..", "..", "src"))
if ASM3_SRC not in sys.path and os.path.isdir(ASM3_SRC):
    sys.path.insert(0, ASM3_SRC)

from asm3 import al
from asm3 import db
from asm3.sitedefs import MULTIPLE_DATABASES, MULTIPLE_DATABASES_MAP, MULTIPLE_DATABASES_TYPE

import animaltracker_sync


def _run_for_alias(alias: str) -> None:
    banner = alias or "(default)"
    print(f"== Animal Tracker sync: {banner} ==")
    dbo = db.get_database(alias)
    dbo.timeout = 0
    dbo.connection = dbo.connect()
    animaltracker_sync.sync_recent_animals(dbo)


def main() -> int:
    alias = (os.getenv("ASM3_DBALIAS") or "").strip()
    target_dbname = (os.getenv("ASM3_TARGET_DBNAME") or "asm3").strip()

    if not MULTIPLE_DATABASES:
        _run_for_alias("")
        return 0

    if MULTIPLE_DATABASES_TYPE == "map":
        if alias:
            _run_for_alias(alias)
            return 0
        if len(MULTIPLE_DATABASES_MAP) == 0:
            # Misconfigured multi-db mode; fall back to default db settings
            al.warn(
                "MULTIPLE_DATABASES is enabled but MULTIPLE_DATABASES_MAP is empty; falling back to default database.",
                "animaltracker_cli",
                None,
            )
            dbo = db.get_dbo()
            dbo.timeout = 0
            dbo.connection = dbo.connect()
            animaltracker_sync.sync_recent_animals(dbo)
            return 0

        matched_aliases = [
            a for a, cfg in MULTIPLE_DATABASES_MAP.items()
            if (cfg.get("database") or "").strip() == target_dbname
        ]
        if len(matched_aliases) == 0:
            print(
                f"No database aliases found for database={target_dbname!r}. "
                f"Available databases: {sorted({(v.get('database') or '').strip() for v in MULTIPLE_DATABASES_MAP.values() if v.get('database')})}",
                file=sys.stderr,
            )
            return 2
        for a in matched_aliases:
            _run_for_alias(a)
        return 0

    # smcom mode requires an alias
    if not alias:
        print("MULTIPLE_DATABASES smcom mode requires ASM3_DBALIAS to be set.", file=sys.stderr)
        return 2
    _run_for_alias(alias)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
