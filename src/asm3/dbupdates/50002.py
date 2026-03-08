#!/usr/bin/env python3

"""
Database migration 50002: Add AIContext column to role table

Allows per-role AI assistant context to customize the AI's behavior
and suggestions based on the user's role (e.g., vet vs receptionist).
"""

from asm3.dbupdate import add_column

add_column(dbo, "role", "AIContext", dbo.type_longtext)
