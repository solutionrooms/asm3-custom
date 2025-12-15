
import os
import sys
import unittest

CUSTOM_SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "customizations", "src"))
if CUSTOM_SRC not in sys.path and os.path.isdir(CUSTOM_SRC):
    sys.path.insert(0, CUSTOM_SRC)

import animaltracker_records_parser


HTML_SNIPPET = """
<div class="scroller">
    <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tbody>
            <tr>
                <td class="col1">
                    <a href="/_account/record/?microchipID={DECE2973-14AE-4F1E-B4FD-1DEC112DF130}">900255000502401</a>
                </td>
                <td class="col2">Max</td>
                <td class="col3">Hedgehog</td>
                <td class="col4"></td>
                <td class="col5">23/10/2023</td>
                <td class="col6">01/12/2023</td>
            </tr>
            <tr>
                <td class="col1">
                    <a href="/_account/record/?microchipID={F7F10822-A80E-4B4A-A0DE-3FFC628C10B8}">900255000502402</a>
                </td>
                <td class="col2">Louise</td>
                <td class="col3">Hedgehog</td>
                <td class="col4"></td>
                <td class="col5">03/11/2023</td>
                <td class="col6">01/12/2023</td>
            </tr>
        </tbody>
    </table>
</div>
"""


class TestAnimalTrackerRecordsParse(unittest.TestCase):
    def test_parse_extracts_records(self):
        records = animaltracker_records_parser.parse_records_html(HTML_SNIPPET)
        self.assertEqual(2, len(records))
        self.assertEqual("900255000502401", records[0].microchip_no)
        self.assertEqual("{DECE2973-14AE-4F1E-B4FD-1DEC112DF130}", records[0].microchip_id)
        self.assertEqual("Max", records[0].name)
        self.assertEqual("23/10/2023", records[0].date_of_birth)
        self.assertEqual("01/12/2023", records[0].implant_date)
