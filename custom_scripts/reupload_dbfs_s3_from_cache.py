#!/usr/bin/env python3
"""
One-off helper: Re-upload DBFS S3 objects from the disk cache when DBFS URLs
have already been flipped to s3: but the objects are missing in the bucket.

Usage (inside container):
  ASM3_CONF=/app/asm3.conf python3 /app/custom_scripts/reupload_dbfs_s3_from_cache.py

This script does not modify core and relies on:
- asm3.cachedisk to read cached bytes
- asm3.sitedefs for S3 config (bucket/endpoint)
- boto3 via S3Storage._s3client()
"""

import os
import sys

sys.path.insert(0, "/app/src")

import asm3.al as al
import asm3.cachedisk as cachedisk
import asm3.db as db
import asm3.utils as utils
from asm3.dbfs import S3Storage


def main() -> int:
    dbo = db.get_database()
    dbo.timeout = 0
    dbo.connection = dbo.connect()
    dbo.installpath = os.getcwd() + os.sep

    al.info("start reupload from cache", "custom.reupload_dbfs_s3_from_cache", dbo)

    s3 = S3Storage(dbo)
    bucket = s3.bucket
    if bucket == "":
        al.error("DBFS_S3_BUCKET not configured", "custom.reupload_dbfs_s3_from_cache", dbo)
        return 1

    rows = dbo.query("SELECT ID, Name, URL FROM dbfs WHERE URL LIKE 's3:%' ORDER BY ID")
    repaired = 0
    skipped = 0
    failed = 0
    for r in rows:
        try:
            url = r.URL
            name = r.NAME
            cachekey = s3._cache_key(url)
            cachettl = s3._cache_ttl(name)
            data = cachedisk.touch(cachekey, dbo.name(), cachettl)
            if data is None:
                skipped += 1
                al.debug(f"no cache for {r.ID}:{name}, skipping", "custom.reupload_dbfs_s3_from_cache", dbo)
                continue
            object_key = f"{dbo.name()}/{url.replace('s3:', '')}"
            s3._s3client().put_object(Bucket=bucket, Key=object_key, Body=data)
            repaired += 1
            al.info(f"uploaded s3://{bucket}/{object_key}", "custom.reupload_dbfs_s3_from_cache", dbo)
        except Exception as err:
            failed += 1
            al.error(f"failed {r.ID}:{r.NAME}: {err}", "custom.reupload_dbfs_s3_from_cache", dbo)

    al.info(f"end reupload: repaired={repaired}, skipped(no cache)={skipped}, failed={failed}", "custom.reupload_dbfs_s3_from_cache", dbo)
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())

