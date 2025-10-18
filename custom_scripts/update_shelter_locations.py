#!/usr/bin/env python3
"""Update shelter locations from a CSV mapping.

Workflow:
1. Move every animal currently in the "Shelter" internal location to "Unknown".
2. Read `raw_data/in_shelter_20251017.csv` (or a custom path) and move the
   listed animals back to the "Shelter" location, setting their unit number
   from the CSV "Number" column.
3. Print a summary and list any CSV rows that could not be matched.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import csv
import sys
from pathlib import Path
from typing import Iterable, List, Tuple
import argparse

CONTAINER_ENV_FLAG = "ASM3_SCRIPT_CONTAINER"

# If we're not inside the container, re-run the script via docker-compose exec.
if os.environ.get(CONTAINER_ENV_FLAG) != "1":
    docker_compose = shutil.which("docker-compose")
    if docker_compose:
        cmd = [
            docker_compose,
            "exec",
            "-T",
            "asm3",
            "env",
            f"{CONTAINER_ENV_FLAG}=1",
            "python3",
            "/app/custom_scripts/update_shelter_locations.py",
            *sys.argv[1:],
        ]
        try:
            subprocess.check_call(cmd)
        except subprocess.CalledProcessError as exc:
            raise SystemExit(exc.returncode)
        sys.exit(0)
    else:
        print(
            "ERROR: docker-compose not found. Run inside the asm3 container:\n"
            "       docker-compose exec asm3 python3 /app/custom_scripts/update_shelter_locations.py",
            file=sys.stderr,
        )
        sys.exit(1)

# Inside the container we expect ASM3_CONF to point at /app/asm3.conf.
ASM3_CONF = os.environ.get("ASM3_CONF")
if not ASM3_CONF or not Path(ASM3_CONF).exists():
    print(
        f"ERROR: ASM3_CONF is not set or file is missing ({ASM3_CONF}). "
        "Ensure the container is running and ASM3_CONF is configured.",
        file=sys.stderr,
    )
    sys.exit(2)

SCRIPT_DIR = Path(__file__).resolve().parent
SRC_PATH = SCRIPT_DIR.parent / "src"
src_path_str = str(SRC_PATH)
if src_path_str not in sys.path:
    sys.path.insert(0, src_path_str)

import logging

import asm3.animal  # type: ignore  # noqa: E402
import asm3.db  # type: ignore  # noqa: E402
import asm3.utils  # type: ignore  # noqa: E402
import asm3.al  # type: ignore  # noqa: E402
from asm3.sitedefs import MULTIPLE_DATABASES, MULTIPLE_DATABASES_MAP  # type: ignore  # noqa: E402

# Reduce noisy debug logging during bulk updates.
asm3.al.LOG_DEBUG = False
asm3.al.logger.setLevel(logging.INFO)

DEFAULT_CSV = SCRIPT_DIR.parent / "raw_data" / "in_shelter_20251017.csv"
USERNAME = "system"


def normalise_name(value: str) -> str:
    return value.strip().lower()


def resolve_location_id(dbo, name: str) -> int:
    row = dbo.first_row(
        dbo.query(
            "SELECT ID FROM internallocation WHERE lower(LocationName) = ?",
            [name.lower()],
        )
    )
    if row is None:
        raise RuntimeError(f"Internal location '{name}' not found.")
    return int(row.ID)


def move_all_from_shelter_to_unknown(dbo, shelter_id: int, unknown_id: int) -> int:
    rows = dbo.query(
        "SELECT ID FROM animal WHERE ShelterLocation = ? AND Archived = 0",
        [shelter_id],
    )
    count = 0
    for row in rows:
        asm3.animal.update_location_unit(
            dbo,
            USERNAME,
            int(row.ID),
            unknown_id,
            "",
            returnactivemovement=False,
        )
        count += 1
    return count


def load_assignments(csv_path: Path) -> Iterable[Tuple[str, str]]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        if "Number" not in reader.fieldnames or "Name" not in reader.fieldnames:
            raise RuntimeError(
                f"CSV '{csv_path}' must contain 'Number' and 'Name' columns."
            )
        for row in reader:
            number = (row.get("Number") or "").strip()
            name = (row.get("Name") or "").strip()
            if not name:
                continue
            yield number, name


def assign_animals_to_shelter(
    dbo, csv_path: Path, shelter_id: int
) -> Tuple[List[str], List[str], int]:
    missing: List[str] = []
    ambiguous: List[str] = []
    processed = 0

    for unit_number, name in load_assignments(csv_path):
        norm = normalise_name(name)
        matches = dbo.query(
            "SELECT ID, Archived FROM animal WHERE lower(AnimalName) = ?",
            [norm],
        )
        if not matches:
            missing.append(name)
            continue

        actives = [m for m in matches if int(m.ARCHIVED) == 0]
        if len(actives) == 1:
            chosen = actives[0]
        elif len(actives) == 0 and len(matches) == 1:
            # Only archived match; use it but warn.
            chosen = matches[0]
        else:
            ambiguous.append(name)
            continue

        asm3.animal.update_location_unit(
            dbo,
            USERNAME,
            int(chosen.ID),
            shelter_id,
            unit_number,
            returnactivemovement=False,
        )
        processed += 1

    return missing, ambiguous, processed


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update shelter locations from CSV mapping.")
    parser.add_argument(
        "--csv",
        default=str(DEFAULT_CSV),
        help="Path to CSV file (defaults to raw_data/in_shelter_20251017.csv)",
    )
    parser.add_argument(
        "--alias",
        default=None,
        help="Database alias when multiple databases are configured (e.g. bghr)",
    )
    return parser.parse_args(argv[1:])


def main(argv: List[str]) -> int:
    args = parse_args(argv)

    csv_path = Path(args.csv)
    if not csv_path.is_absolute():
        csv_path = SCRIPT_DIR.parent / csv_path
    csv_path = csv_path.resolve()
    if not csv_path.exists():
        raise SystemExit(f"CSV file not found: {csv_path}")

    alias = args.alias
    if MULTIPLE_DATABASES:
        if not alias:
            aliases = list(MULTIPLE_DATABASES_MAP.keys())
            if len(aliases) == 1:
                alias = aliases[0]
            else:
                raise SystemExit(
                    "Multiple databases configured. Specify an alias with --alias.\n"
                    f"Available aliases: {', '.join(aliases)}"
                )
    dbo = asm3.db.get_database(alias or "")
    if dbo.database in asm3.db.ERROR_VALUES:
        raise SystemExit(
            f"Unable to connect to database (alias: {alias or 'default'}). "
            "Check ASM3_DB* settings."
        )

    shelter_id = resolve_location_id(dbo, "Shelter")
    unknown_id = resolve_location_id(dbo, "Unknown")

    moved = move_all_from_shelter_to_unknown(dbo, shelter_id, unknown_id)
    print(f"[alias: {alias or 'default'}] Moved {moved} animals from 'Shelter' to 'Unknown'.")

    missing, ambiguous, assigned = assign_animals_to_shelter(dbo, csv_path, shelter_id)
    print(f"[alias: {alias or 'default'}] Assigned {assigned} animals to 'Shelter' using {csv_path}.")

    if ambiguous:
        print("\nAmbiguous names (multiple active matches; skipped):")
        for name in sorted(set(ambiguous)):
            print(f"  - {name}")

    if missing:
        print("\nNames from CSV not found in database:")
        for name in sorted(set(missing)):
            print(f"  - {name}")

    try:
        dbo.commit()
    except AttributeError:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
