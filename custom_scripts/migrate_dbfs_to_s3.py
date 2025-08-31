#!/usr/bin/env python3
"""
Safe DBFS -> S3 migration without core changes.

Uploads each DBFS file synchronously to S3 and only updates the dbfs row
after a successful upload. Skips rows that already have s3: URLs.

Usage (inside container):
  ASM3_CONF=/app/asm3.conf python3 /app/custom_scripts/migrate_dbfs_to_s3.py
"""

import os
import sys

sys.path.insert(0, "/app/src")

import asm3.al as al
import asm3.db as db
import asm3.dbfs as dbfs
import asm3.utils as utils

def main() -> int:
    dbo = db.get_database()
    dbo.timeout = 0
    dbo.connection = dbo.connect()
    dbo.installpath = os.getcwd() + os.sep

    al.info("start migrate_dbfs_to_s3", "custom.migrate_dbfs_to_s3", dbo)

    # Prepare S3 client using ASM3's S3Storage for config
    s3 = dbfs.S3Storage(dbo)
    bucket = s3.bucket

    if bucket == "":
        al.error("DBFS_S3_BUCKET not configured; aborting", "custom.migrate_dbfs_to_s3", dbo)
        return 2

    rows = dbo.query("SELECT ID, Name, Path, URL FROM dbfs WHERE Name LIKE '%.%' ORDER BY ID")

    migrated = 0
    skipped = 0
    failed = 0

    for r in rows:
        rid = r.ID
        name = r.NAME
        url = r.URL or ""

        # Skip if already migrated
        if isinstance(url, str) and url.startswith("s3:"):
            skipped += 1
            continue

        # Build object key from db name and extension
        ext = ""
        if "." in name:
            ext = name[name.rfind("."):]
        object_key = f"{dbo.name()}/{rid}{ext}"

        try:
            # Read from the existing storage for this row
            storage = dbfs.DBFSStorage(dbo, url)
            body = storage.get(rid, url)

            # Put to S3 synchronously
            s3._s3client().put_object(Bucket=bucket, Key=object_key, Body=body)

            # Update DBFS row to point to S3 and clear Content
            new_url = f"s3:{rid}{ext}"
            dbo.execute("UPDATE dbfs SET URL = ?, Content = '' WHERE ID = ?", (new_url, rid))
            # Update media size if any media rows reference this DBFSID
            dbo.execute("UPDATE media SET MediaSize = ? WHERE DBFSID = ?", (len(body), rid))

            migrated += 1
            al.info(f"migrated {rid}:{name} -> s3://{bucket}/{object_key}", "custom.migrate_dbfs_to_s3", dbo)
        except Exception as err:
            failed += 1
            al.error(f"failed {rid}:{name}: {err}", "custom.migrate_dbfs_to_s3", dbo)

    al.info(f"end migrate_dbfs_to_s3: migrated={migrated}, skipped(already s3)={skipped}, failed={failed}", "custom.migrate_dbfs_to_s3", dbo)
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())

