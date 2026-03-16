#!/usr/bin/env python3

"""
Database migration 50003: Add social_media_summary table

Stores AI-generated daily summaries of shelter activity for staff
to review, edit, and post to social media.
"""

from asm3.dbupdate import add_column, add_index, execute

l = dbo.locale

execute(dbo, "CREATE TABLE social_media_summary ("
    "ID %(int)s NOT NULL PRIMARY KEY, "
    "SummaryDate %(date)s NOT NULL, "
    "RawData %(long)s, "
    "GeneratedText %(long)s, "
    "EditedText %(long)s, "
    "Status %(int)s NOT NULL, "
    "PostedDate %(date)s, "
    "PostedBy %(short)s, "
    "Platform %(short)s, "
    "RecordVersion %(int)s, "
    "CreatedBy %(short)s, "
    "CreatedDate %(date)s, "
    "LastChangedBy %(short)s, "
    "LastChangedDate %(date)s)"
    % { "int": dbo.type_integer, "date": dbo.type_datetime,
        "short": dbo.type_shorttext, "long": dbo.type_longtext })

add_index(dbo, "social_media_summary_SummaryDate", "social_media_summary", "SummaryDate")
add_index(dbo, "social_media_summary_Status", "social_media_summary", "Status")

# Create sequence for PostgreSQL auto-increment IDs
try:
    execute(dbo, "CREATE SEQUENCE seq_social_media_summary START 1")
except:
    pass  # Sequence may already exist or DB type doesn't need it
