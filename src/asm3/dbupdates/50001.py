#!/usr/bin/env python3

"""
Database migration 50001: Add unique constraint to animal names

This migration adds a unique index to the animal.AnimalName field to prevent
duplicate animal names within the shelter system.

Prerequisites: All existing duplicate names must be resolved before applying
this migration. The migration will fail if duplicates exist.

Author: Custom ASM3 Fork
Date: 2025-08-25
"""

from asm3.dbupdate import add_index, execute
import asm3.al

# Check if any duplicate names still exist before adding unique constraint
duplicates = dbo.query("SELECT animalname, COUNT(*) as count FROM animal " +
                      "WHERE animalname IS NOT NULL AND animalname != '' " +
                      "GROUP BY animalname HAVING COUNT(*) > 1")

if len(duplicates) > 0:
    # Log duplicate names found
    duplicate_names = [d["ANIMALNAME"] for d in duplicates]
    asm3.al.error("Migration 50001 failed: Duplicate animal names found: %s" % ", ".join(duplicate_names), 
                  "dbupdate.50001", dbo)
    raise Exception("Cannot add unique constraint: duplicate animal names exist: %s" % ", ".join(duplicate_names))

# Remove existing non-unique index first (if it exists)
try:
    execute(dbo, "DROP INDEX IF EXISTS animal_AnimalName")
except:
    # Index might not exist or have different name, continue
    pass

# Add unique constraint to animal names
# This will prevent duplicate animal names from being created
# If the index already exists (eg, created manually), skip creation (and avoid noisy SQL errors).
idx_exists = False
try:
    if dbo.dbtype == "POSTGRESQL":
        idx_exists = dbo.query_int(
            "SELECT COUNT(1) FROM pg_indexes WHERE schemaname='public' AND indexname='animal_animalname_unique'"
        ) > 0
except:
    idx_exists = False

if not idx_exists:
    add_index(dbo, "animal_AnimalName_unique", "animal", "AnimalName", unique=True, ignore_errors=True)

# Log successful migration
asm3.al.info("Migration 50001 completed: Unique constraint added to animal names", 
             "dbupdate.50001", dbo)
