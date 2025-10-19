#!/usr/bin/env python3

import argparse
import os
import sys

PATH = os.path.dirname(os.path.abspath(__file__)) + os.sep
SRC_PATH = PATH + "../../src/"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate the SQLite schema database used for SQL hints")
    default_path = PATH + "../../scripts/schema/schema.db"
    parser.add_argument(
        "--output",
        default=default_path,
        help="Path for the generated schema SQLite database (default: %(default)s)",
    )
    return parser.parse_args()

sys.path.append(PATH)
sys.path.append(SRC_PATH)

import asm3.db

args = parse_args()
DB_PATH = os.path.abspath(args.output)

try:
    # remove existing schema database first
    os.unlink(DB_PATH)
except:
    pass

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# Create new schema database
dbo = asm3.db.get_dbo("SQLITE")
dbo.database = DB_PATH
dbo.installpath = SRC_PATH
asm3.dbupdate.install_db_structure(dbo)
asm3.dbupdate.install_db_views(dbo)
