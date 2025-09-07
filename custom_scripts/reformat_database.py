#!/usr/bin/env python3
"""
Reformat source CSV for ASM3 import.

Phase 1 goal: Generate a blank column mapping template you can edit.

Usage examples:
  - Generate mapping template from the source CSV headers:
      python3 custom_scripts/reformat_database.py \
          --source raw_data/raw_database.csv \
          --generate-mapping

  - Rename columns using a filled mapping and write a timestamped
    output CSV prefixed with "fixed_". Columns are:
      source,target,transform
        - If target is set (and not '???'), the column is renamed.
        - If transform is '[REMOVE]', that mapping row is ignored and the
          original source column is dropped. To both create mapped copies
          and drop the original, add one or more mapping rows (no transform)
          and a separate row with transform '[REMOVE]' for that source.
        - Repeat the same source with different targets to duplicate a
          column (each target becomes a new column using the source's data).
        - Use a quoted literal as source (eg: 'Yes' or "No") to add a
          new column with that constant value on every row.
        - Use transform 'calculated_fields_deceased_date' to extract a
          deceased date from a source that starts with 'Deceased ...'.
          Example: Addition Comments,ANIMALDECEASEDDATE,calculated_fields_deceased_date
        - Use transform 'release_to_wild_movement_type' to return '7' when
          the source cell is non-blank (else blank). Example:
          Release Date,MOVEMENTTYPE,release_to_wild_movement_type
        - Duplicate target names are not allowed and will raise an error.
      python3 custom_scripts/reformat_database.py \
          --source raw_data/raw_database.csv \
          --mapping raw_data/column_map.csv \
          --rename [--limit-rows 100]

Notes:
  - This script only uses Python's standard library.
  - It reads CSV using UTF-8 with BOM handling and attempts basic
    dialect sniffing for delimiter/quoting.
  - Post-rename adjustments implemented:
    * Suffix duplicate ANIMALNAME values with "(Duplicate # x)" for repeats.
    * If MOVEMENTDATE is earlier than ANIMALENTRYDATE, set ANIMALENTRYDATE
      to MOVEMENTDATE and append a note to ANIMALDESCRIPTION.
    * Accept month-year movement dates (eg: "Jan 2024") and default day to 1.
  - Future phases (data cleanup, fuzzy logic, error handling) have
    placeholders where we can plug in rules once columns are mapped.
"""

from __future__ import annotations

import argparse
import csv
import datetime as _dt
import os
import sys
import re
from typing import Dict, List, Tuple, Any, Optional, Callable


DEFAULT_SOURCE = os.path.join("raw_data", "raw_database.csv")
DEFAULT_MAPPING_BASENAME = "column_map.csv"


def _read_csv_header(path: str) -> Tuple[List[str], csv.Dialect]:
    """Return (header_columns, dialect) detected for the CSV file.

    - Uses UTF-8 with BOM handling to absorb a potential BOM in the first
      header.
    - Uses csv.Sniffer to detect delimiter/quoting; falls back to comma.
    - Strips whitespace around header names.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"Source CSV not found: {path}")

    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        # Read a sample for sniffer
        sample = f.read(4096)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except Exception:
            dialect = csv.excel

        reader = csv.reader(f, dialect=dialect)
        try:
            header = next(reader)
        except StopIteration:
            raise ValueError("Source CSV is empty; no header row found")

    # Normalize header cells
    cols = [h.strip() for h in header]
    return cols, dialect


def _mapping_path_for_source(source: str, mapping_arg: str | None) -> str:
    """Derive mapping CSV path.

    - If --mapping provided, use it.
    - Else use <source_dir>/column_map.csv by default.
    """
    if mapping_arg:
        return mapping_arg
    base_dir = os.path.dirname(os.path.abspath(source))
    return os.path.join(base_dir, DEFAULT_MAPPING_BASENAME)


def _write_blank_mapping(mapping_path: str, source_cols: List[str]) -> None:
    """Write a mapping CSV with columns: source,target,transform.

    - target: desired ASM field name (blank or '???' means unset)
    - transform: optional directive; if set to '[REMOVE]' column is dropped

    Does not overwrite an existing file unless explicitly requested
    by the caller (the caller should remove the file or pass --force).
    """
    with open(mapping_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["source", "target", "transform"])  # header
        for src in source_cols:
            writer.writerow([src, "", ""])  # blank target and transform


def _load_mapping(mapping_path: str) -> List[Dict[str, str]]:
    """Load mapping CSV rows preserving order.

    Returns a list of rows: [{source, target, transform?}].

    Accepts header names in any case; requires a column named
    'source' and 'target' (case-insensitive). 'transform' is optional.
    """
    if not os.path.exists(mapping_path):
        raise FileNotFoundError(
            f"Mapping file not found: {mapping_path}. Run with --generate-mapping first."
        )

    with open(mapping_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        # Normalize fieldnames
        if not reader.fieldnames:
            raise ValueError("Mapping CSV has no header")
        fields = [fn.strip().lower() for fn in reader.fieldnames]
        try:
            source_idx = fields.index("source")
            target_idx = fields.index("target")
        except ValueError:
            raise ValueError("Mapping CSV must have 'source' and 'target' columns")
        transform_idx = fields.index("transform") if "transform" in fields else None

        rows: List[Dict[str, str]] = []
        for row in reader:
            # Access via indices to be robust to header casing
            values = list(row.values())
            src = (values[source_idx] or "").strip()
            tgt = (values[target_idx] or "").strip()
            trans = ""
            if transform_idx is not None and transform_idx < len(values):
                trans = (values[transform_idx] or "").strip()
            if src:
                rows.append({"source": src, "target": tgt, "transform": trans})

    return rows


def _is_remove_transform(value: str) -> bool:
    return value.strip().upper() == "[REMOVE]"


def _valid_target(value: str) -> bool:
    v = value.strip()
    if not v:
        return False
    # Treat '???' as unset placeholder
    return v != "???"


def _has_any_actions(mapping_rows: List[Dict[str, str]]) -> bool:
    # True if any valid target set or any remove transform present
    for v in mapping_rows:
        if _valid_target(v.get("target", "")):
            return True
        if _is_remove_transform(v.get("transform", "")):
            return True
    return False


def _make_output_path(source: str, outdir: str | None) -> str:
    ts = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    base = os.path.basename(source)
    name, ext = os.path.splitext(base)
    if name.startswith("raw_"):
        name = name[len("raw_"):]
    out_name = f"fixed_{name}_{ts}{ext or '.csv'}"
    target_dir = outdir or os.path.dirname(os.path.abspath(source))
    return os.path.join(target_dir, out_name)


def _rename_columns(
    source: str,
    mapping_rows: List[Dict[str, str]],
    dialect: csv.Dialect,
    out_path: str,
    limit_rows: Optional[int] = None,
) -> None:
    """Write a copy of the CSV with columns renamed per mapping.

    Behaviors:
    - Multiple rows with the same 'source' create multiple target columns
      with identical data based on that source.
    - A row with a quoted 'source' (eg: 'Yes' or "No") creates a new
      column with that literal value for every row.
    - If any mapping exists for a source with a valid target, the original
      source column is not emitted unless also mapped by name.
    - 'transform' == '[REMOVE]' drops the original column if there are
      no valid target mappings for that source.
    - Fails if the final output has duplicate column names.
    """
    def is_literal_source(s: str) -> bool:
        s = s.strip()
        return len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"')

    def literal_value(s: str) -> str:
        s = s.strip()
        return s[1:-1]

    with open(source, "r", encoding="utf-8-sig", newline="") as fin, \
         open(out_path, "w", encoding="utf-8", newline="") as fout:
        reader = csv.reader(fin, dialect=dialect)
        writer = csv.writer(fout, dialect=dialect)

        try:
            header = next(reader)
        except StopIteration:
            raise ValueError("Source CSV is empty; no header row found")

        # Normalize header names
        header = [h.strip() for h in header]

        # Organize mapping rows
        targets_by_source: Dict[str, List[str]] = {}
        remove_by_source: Dict[str, bool] = {}
        literal_entries: List[Tuple[str, str]] = []  # (target, value)
        calc_by_source: Dict[str, List[Tuple[str, Callable[[str], str]]]] = {}

        # Transform functions registry
        def tf_deceased_date(cell: str) -> str:
            if not cell:
                return ""
            m = re.match(r"^\s*deceased\b\s*[:,-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", str(cell), re.IGNORECASE)
            return m.group(1) if m else ""

        def tf_release_to_wild_movement_type(cell: str) -> str:
            # Return '7' when the input cell is non-blank, else ''
            return "7" if str(cell).strip() else ""

        for mr in mapping_rows:
            src = (mr.get("source", "") or "").strip()
            tgt = (mr.get("target", "") or "").strip()
            trans = (mr.get("transform", "") or "").strip()

            if not src:
                continue

            if is_literal_source(src):
                # If transform is [REMOVE], skip this literal entirely
                if _is_remove_transform(trans):
                    continue
                if _valid_target(tgt):
                    literal_entries.append((tgt, literal_value(src)))
                continue

            if _is_remove_transform(trans):
                # Mark source for removal and ignore this mapping row's target
                remove_by_source[src] = True
                continue

            # Transform-specific calculated fields
            if trans:
                tkey = trans.strip().lower()
                if _valid_target(tgt):
                    if tkey == "calculated_fields_deceased_date":
                        calc_by_source.setdefault(src, []).append((tgt, tf_deceased_date))
                        continue
                    if tkey == "release_to_wild_movement_type":
                        calc_by_source.setdefault(src, []).append((tgt, tf_release_to_wild_movement_type))
                        continue

            if _valid_target(tgt):
                targets_by_source.setdefault(src, []).append(tgt)

        # Warn about mappings for unknown sources (except literals)
        unknown_sources = [s for s in targets_by_source.keys() if s not in header]
        if unknown_sources:
            print(
                "WARNING: Mapping references unknown source columns: "
                + ", ".join(sorted(unknown_sources)),
                file=sys.stderr,
            )

        # Build final header and column operations
        final_header: List[str] = []
        col_ops: List[Tuple[str, Any]] = []  # ('index', idx) | ('literal', value) | ('calc', (idx, func))

        for idx, key in enumerate(header):
            maps = targets_by_source.get(key, [])
            calcs = calc_by_source.get(key, [])
            if maps or calcs:
                for tgt in maps:
                    final_header.append(tgt)
                    col_ops.append(("index", idx))
                for tgt, func in calcs:
                    final_header.append(tgt)
                    col_ops.append(("calc", (idx, func)))
            else:
                if remove_by_source.get(key, False):
                    continue  # drop column
                final_header.append(key)  # passthrough
                col_ops.append(("index", idx))

        # Append literal columns at the end in the order provided
        for tgt, value in literal_entries:
            final_header.append(tgt)
            col_ops.append(("literal", value))

        # Check for duplicate target names
        seen: Dict[str, int] = {}
        dups: List[str] = []
        for name in final_header:
            if name in seen:
                if name not in dups:
                    dups.append(name)
            else:
                seen[name] = 1
        if dups:
            raise ValueError(
                "Duplicate column names in output: " + ", ".join(dups)
            )

        writer.writerow(final_header)

        # Post-rename processing configuration
        # - Track duplicates for ANIMALNAME
        name_idx = final_header.index("ANIMALNAME") if "ANIMALNAME" in final_header else None
        # - Movement/Entry date adjustment indices
        move_idx = final_header.index("MOVEMENTDATE") if "MOVEMENTDATE" in final_header else None
        entry_idx = final_header.index("ANIMALENTRYDATE") if "ANIMALENTRYDATE" in final_header else None
        desc_idx = final_header.index("ANIMALDESCRIPTION") if "ANIMALDESCRIPTION" in final_header else None
        decease_idx = final_header.index("ANIMALDECEASEDDATE") if "ANIMALDECEASEDDATE" in final_header else None

        # Helper to parse many common date formats; returns datetime or None
        def _parse_date(v: str) -> Optional[_dt.datetime]:
            v = (v or "").strip()
            if not v:
                return None
            # Try common numeric formats first
            fmts = (
                "%Y-%m-%d",
                "%d/%m/%Y",
                "%m/%d/%Y",
                "%d-%m-%Y",
                "%m-%d-%Y",
                "%d/%m/%y",
                "%m/%d/%y",
                "%d-%m-%y",
                "%m-%d-%y",
            )
            for fmt in fmts:
                try:
                    return _dt.datetime.strptime(v, fmt)
                except Exception:
                    pass
            # Handle month-name + year with missing day (default day=1)
            # Examples: "Jan 2024", "January 2024", "Jan-2024", "Jan/2024", "2024 Jan"
            mv = v.lower().strip()
            month_map = {
                "jan": 1, "january": 1,
                "feb": 2, "february": 2,
                "mar": 3, "march": 3,
                "apr": 4, "april": 4,
                "may": 5,
                "jun": 6, "june": 6,
                "jul": 7, "july": 7,
                "aug": 8, "august": 8,
                "sep": 9, "sept": 9, "september": 9,
                "oct": 10, "october": 10,
                "nov": 11, "november": 11,
                "dec": 12, "december": 12,
            }
            # Patterns: month year OR year month
            m1 = re.match(r"^([a-z]{3,})[\s\-\/]?(\d{4})$", mv)
            m2 = re.match(r"^(\d{4})[\s\-\/]?([a-z]{3,})$", mv)
            try:
                if m1:
                    mon = month_map.get(m1.group(1), None)
                    yr = int(m1.group(2))
                    if mon:
                        return _dt.datetime(yr, mon, 1)
                if m2:
                    yr = int(m2.group(1))
                    mon = month_map.get(m2.group(2), None)
                    if mon:
                        return _dt.datetime(yr, mon, 1)
            except Exception:
                pass
            return None

        def _format_iso_date(v: str) -> str:
            """Parse a date and return YYYY-MM-DD if possible, else original."""
            dt = _parse_date(v)
            return dt.strftime("%Y-%m-%d") if dt else v

        seen_names: Dict[str, int] = {}

        written = 0
        for row in reader:
            out_row: List[str] = []
            for kind, arg in col_ops:
                if kind == "index":
                    out_row.append(row[arg])
                elif kind == "literal":
                    out_row.append(arg)
                elif kind == "calc":
                    idx, func = arg  # type: ignore[misc]
                    cell = row[idx] if idx < len(row) else ""
                    try:
                        out_row.append(func(cell))
                    except Exception:
                        out_row.append("")
                else:
                    out_row.append("")
            # Post-rename row processing
            # 1) Suffix duplicate ANIMALNAMEs with "(Duplicate # x)"
            if name_idx is not None and name_idx < len(out_row):
                current_name = out_row[name_idx]
                key = (current_name or "").strip()
                if key:
                    count = seen_names.get(key, 0)
                    if count >= 1:
                        out_row[name_idx] = f"{current_name} (Duplicate # {count})"
                    seen_names[key] = count + 1

            # 2) If MOVEMENTDATE < ANIMALENTRYDATE, set entry to movement and
            #    append an explanatory comment to ANIMALDESCRIPTION
            if (
                move_idx is not None and entry_idx is not None and
                move_idx < len(out_row) and entry_idx < len(out_row)
            ):
                mv_raw = out_row[move_idx]
                en_raw = out_row[entry_idx]
                mv_dt = _parse_date(mv_raw)
                en_dt = _parse_date(en_raw)
                if mv_dt and en_dt and mv_dt < en_dt:
                    # Update entry date to the original movement date string
                    out_row[entry_idx] = mv_raw
                    # Append comment to ANIMALDESCRIPTION if present
                    if desc_idx is not None and desc_idx < len(out_row):
                        comment = (
                            f"Entry date adjusted to movement date (was '{en_raw}', movement '{mv_raw}')."
                        )
                        existing = (out_row[desc_idx] or "").strip()
                        if not existing or existing.lower() == "none":
                            out_row[desc_idx] = comment
                        else:
                            out_row[desc_idx] = f"{existing} | {comment}"

                # 3) Normalize dates to ISO (YYYY-MM-DD) for importer locale safety
                #    Always convert movement/entry if parseable
                if mv_raw:
                    out_row[move_idx] = _format_iso_date(out_row[move_idx])
                if en_raw:
                    out_row[entry_idx] = _format_iso_date(out_row[entry_idx])
                if decease_idx is not None and decease_idx < len(out_row):
                    if out_row[decease_idx]:
                        out_row[decease_idx] = _format_iso_date(out_row[decease_idx])

            writer.writerow(out_row)
            written += 1
            if isinstance(limit_rows, int) and limit_rows > 0 and written >= limit_rows:
                break


# Placeholder hooks for future phases
def clean_row(row: Dict[str, str]) -> Dict[str, str]:
    """Apply data cleanup and fuzzy logic here.

    Not used in phase 1. We'll wire this up once column mapping is set.
    """
    return row


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Reformat CSV for ASM3 import")
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="Path to source CSV")
    parser.add_argument("--mapping", default=None, help="Path to column mapping CSV (source,target)")
    parser.add_argument("--outdir", default=None, help="Output directory for processed CSV")
    parser.add_argument("--generate-mapping", action="store_true", help="Generate blank mapping CSV from source headers and exit")
    parser.add_argument("--force", action="store_true", help="Overwrite existing mapping when generating template")
    parser.add_argument("--rename", action="store_true", help="Rename columns per mapping and write a fixed_ output CSV")
    parser.add_argument(
        "--limit-rows",
        "-n",
        type=int,
        default=None,
        help="Limit number of data rows to output (header always included)",
    )

    args = parser.parse_args(argv)

    try:
        headers, dialect = _read_csv_header(args.source)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    mapping_path = _mapping_path_for_source(args.source, args.mapping)

    if args.generate_mapping:
        if os.path.exists(mapping_path) and not args.force:
            print(f"Mapping already exists: {mapping_path} (use --force to overwrite)")
            return 0
        try:
            _write_blank_mapping(mapping_path, headers)
        except Exception as e:
            print(f"ERROR writing mapping: {e}", file=sys.stderr)
            return 2
        print(f"Wrote blank mapping template with {len(headers)} columns: {mapping_path}")
        print("Edit 'target' to ASM fields or set transform to [REMOVE] (see raw_data/import_help.md).")
        return 0

    # If not generating, but asked to rename, attempt to load mapping
    if args.rename:
        try:
            mapping = _load_mapping(mapping_path)
        except Exception as e:
            print(f"ERROR loading mapping: {e}", file=sys.stderr)
            return 2

        if not _has_any_actions(mapping):
            print("Mapping has no changes: set 'target' values or add transform '[REMOVE]'.")
            return 0

        out_path = _make_output_path(args.source, args.outdir)
        try:
            _rename_columns(args.source, mapping, dialect, out_path, limit_rows=args.limit_rows)
        except Exception as e:
            print(f"ERROR during rename: {e}", file=sys.stderr)
            return 2

        print(f"Wrote renamed CSV: {out_path}")
        return 0

    # Default behavior without flags: create mapping if missing
    if not os.path.exists(mapping_path):
        try:
            _write_blank_mapping(mapping_path, headers)
        except Exception as e:
            print(f"ERROR writing mapping: {e}", file=sys.stderr)
            return 2
        print(f"Mapping not found; created template: {mapping_path}")
        print("Next: fill 'target' or add transform [REMOVE], then run with --rename.")
        return 0

    print(
        "Nothing to do. Use --generate-mapping to create a template or --rename to write a fixed_ CSV."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
