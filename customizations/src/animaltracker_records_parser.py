"""
HTML parser for Animal Tracker "View Records" response.

Kept free of ASM3 imports so it can be unit tested without full runtime deps.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
from typing import Dict, List, Tuple


def _clean_text(value: str) -> str:
    value = unescape(value or "")
    # Strip ANSI/control characters (seen occasionally in captured logs).
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
    return " ".join(value.split()).strip()


@dataclass(frozen=True)
class AnimalTrackerRecord:
    microchip_no: str
    microchip_id: str
    name: str
    species: str
    breed: str
    date_of_birth: str
    implant_date: str


class _RecordsHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._in_tbody = False
        self._in_tr = False
        self._current_row: Dict[str, str] = {}
        self._current_td_class: str | None = None
        self._current_td_text: List[str] = []
        self._rows: List[Dict[str, str]] = []

    @property
    def rows(self) -> List[Dict[str, str]]:
        return self._rows

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)

        if tag == "tbody":
            self._in_tbody = True
            return

        if tag == "tr" and self._in_tbody:
            self._in_tr = True
            self._current_row = {}
            return

        if tag == "td" and self._in_tr:
            self._current_td_class = (attrs_dict.get("class") or "").strip() or None
            self._current_td_text = []
            return

        if tag == "a" and self._in_tr:
            href = attrs_dict.get("href") or ""
            match = re.search(r"microchipID=({?[A-Za-z0-9-]+}?)", href, re.IGNORECASE)
            if match and "microchipid" not in self._current_row:
                self._current_row["microchipid"] = _clean_text(match.group(1))
            return

        if tag == "br" and self._current_td_class is not None:
            self._current_td_text.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag == "tbody":
            self._in_tbody = False
            return

        if tag == "td" and self._in_tr and self._current_td_class is not None:
            text = _clean_text("".join(self._current_td_text))
            if text:
                # Preserve first-seen value for a given class; some columns repeat.
                self._current_row.setdefault(self._current_td_class, text)
            self._current_td_class = None
            self._current_td_text = []
            return

        if tag == "tr" and self._in_tr:
            self._in_tr = False
            if self._current_row:
                self._rows.append(self._current_row)
            self._current_row = {}
            return

    def handle_data(self, data: str) -> None:
        if self._current_td_class is None:
            return
        self._current_td_text.append(data)


def parse_records_html(html: str) -> List[AnimalTrackerRecord]:
    parser = _RecordsHTMLParser()
    parser.feed(html or "")

    out: List[AnimalTrackerRecord] = []
    for row in parser.rows:
        microchip_id = _clean_text(row.get("microchipid") or "")
        microchip_no = _clean_text(row.get("col1") or "")
        name = _clean_text(row.get("col2") or "")
        species = _clean_text(row.get("col3") or "")
        breed = _clean_text(row.get("col4") or "")
        dob = _clean_text(row.get("col5") or "")
        implanted = _clean_text(row.get("col6") or "")

        if not microchip_no:
            continue
        out.append(
            AnimalTrackerRecord(
                microchip_no=microchip_no,
                microchip_id=microchip_id,
                name=name,
                species=species,
                breed=breed,
                date_of_birth=dob,
                implant_date=implanted,
            )
        )

    return out

