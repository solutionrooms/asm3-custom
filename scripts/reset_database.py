"""Reset operational ASM3 data while preserving configuration."""

from __future__ import annotations

import sys
from pathlib import Path

SRC_PATH = Path(__file__).resolve().parents[1] / "src"
src_path_str = str(SRC_PATH)
if src_path_str not in sys.path:
    sys.path.insert(0, src_path_str)

import asm3.db  # type: ignore  # noqa: E402
import asm3.dbupdate  # type: ignore  # noqa: E402


def reset_database(alias: str) -> None:
    dbo = asm3.db.get_database(alias)
    if dbo.database in asm3.db.ERROR_VALUES:
        raise RuntimeError(f"Unknown database alias {alias}")

    asm3.dbupdate.reset_db(dbo)
    print(f"Operational data cleared for alias '{alias}'")


def main(argv: list[str]) -> None:
    if len(argv) != 2:
        raise SystemExit("Usage: reset_database.py <alias>")

    _, alias = argv
    reset_database(alias)


if __name__ == "__main__":
    main(sys.argv)
