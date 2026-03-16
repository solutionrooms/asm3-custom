#!/usr/bin/env python3

"""
Daily Social Media Summary Generator - Standalone runner

For running outside Docker (e.g. local testing).
The primary way to run this is via cron.py inside the container:
    docker exec asm3 python3 /app/src/cron.py social_media_summary

Usage:
    python3 social_media_summary.py [--dry-run] [--date YYYY-MM-DD]
"""

import os
import sys
import argparse
from datetime import datetime, timedelta

# Bootstrap paths
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "agent-harness"))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "src"))

from cli_anything.asm3.core.session import SessionManager


def main():
    parser = argparse.ArgumentParser(description="Generate daily social media summary")
    parser.add_argument("--dry-run", action="store_true", help="Show data and prompt without calling AI or storing")
    parser.add_argument("--date", type=str, help="Generate for a specific date (YYYY-MM-DD) instead of today")
    args = parser.parse_args()

    import asm3.social_media

    # Connect to database
    mgr = SessionManager()
    dbo = mgr.get_dbo()

    # Determine the date range
    if args.date:
        summary_date = datetime.strptime(args.date, "%Y-%m-%d")
    else:
        summary_date = datetime.now()

    cutoff_date = (summary_date - timedelta(days=1)).date()

    print("Gathering shelter activity from %s to %s..." % (cutoff_date, summary_date.date()))

    # Gather and format data
    data = asm3.social_media.gather_data(dbo, cutoff_date)
    data_text = asm3.social_media.format_data(data, summary_date)

    print("Found %d new arrivals, %d movements, %d deaths, %d log entries, %d people" % (
        len(data["new_arrivals"]), len(data["movements"]), len(data["deaths"]),
        len(data["logs"]), len(data["people"])))

    if args.dry_run:
        print("\n" + data_text)
        return

    # Generate summary via configured AI provider
    from asm3.sitedefs import AI_ENABLED, AI_API_KEY
    if not AI_ENABLED or not AI_API_KEY:
        print("Error: AI is not enabled. Set ASM3_AI_ENABLED=true and ASM3_AI_API_KEY in .env", file=sys.stderr)
        sys.exit(1)

    generated_text = asm3.social_media.generate_summary_text(dbo, data_text)

    print("\n=== GENERATED SUMMARY ===")
    print(generated_text)
    print("=========================\n")

    # Store in database
    existing = asm3.social_media.get_summary_by_date(dbo, summary_date)
    if existing:
        print("Summary already exists for %s (ID %d). Skipping." % (summary_date, existing.ID))
        return

    summary_id = asm3.social_media.insert_summary(dbo, "system", summary_date, data_text, generated_text)
    print("Stored summary ID %d for %s" % (summary_id, summary_date))
    print("Done.")


if __name__ == "__main__":
    main()
