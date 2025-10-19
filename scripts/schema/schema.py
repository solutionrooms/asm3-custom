#!/usr/bin/env python3

# Read the schema from a SQLite database and output it as static
# JSON data for use by code complete within the application.

import argparse
import json
import os
import sys

PATH = os.path.dirname(os.path.abspath(__file__)) + os.sep
SRC_PATH = PATH + "../../src/"

if PATH not in sys.path:
    sys.path.append(PATH)
if SRC_PATH not in sys.path:
    sys.path.append(SRC_PATH)

try:
    import web  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    import web062 as web  # type: ignore


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Emit JSON schema data used for SQL editor autocompletion")
    default_db = PATH + "../../scripts/schema/schema.db"
    parser.add_argument(
        "--db",
        default=default_db,
        help="Path to the schema SQLite database (default: %(default)s)",
    )
    return parser.parse_args()


args = parse_args()

web.config.debug = False
db = web.database(dbn="sqlite", db=os.path.abspath(args.db))

VIEWS = [ "adoption", "animal", "animalcontrol", "animalfound", "animallost", 
    "animalmedicalcombined", "animalmedicaltreatment", "animaltest", "animalvaccination", 
    "animalwaitinglist", "owner", "ownercitation", "ownerdonation", 
    "ownerlicence", "ownertraploan", "ownervoucher" ]

tables = {}
for table in db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
    tname = table.name
    cols = []
    for col in db.query("pragma table_info(%s)" % tname):
        cols.append(col.name)
    tables[tname] = cols

for v in VIEWS:
    cols = []
    for col in db.query("pragma table_info(v_%s)" % v):
        cols.append(col.name)
    tables["v_%s" % v] = cols

print("schema=%s;" % json.dumps(tables))
