
import unittest
import base

import asm3.microchip_extract
import asm3.users


class FakeChatResponse:
    def __init__(self, text):
        self.text = text
        self.tool_calls = []
        self.stop_reason = "end"
        self.model = "fake"
        self.input_tokens = 0
        self.output_tokens = 0


class FakeProvider:
    """Provider that returns a canned vision response."""
    def __init__(self, text):
        self._text = text
        self.last_prompt = None
        self.last_images = None

    def extract_from_images(self, system_prompt, user_prompt, images):
        self.last_prompt = user_prompt
        self.last_images = images
        return FakeChatResponse(self._text)


class TestSplitDataUrl(unittest.TestCase):

    def test_valid(self):
        mt, data = asm3.microchip_extract._split_data_url("data:image/jpeg;base64,AAAA")
        self.assertEqual(mt, "image/jpeg")
        self.assertEqual(data, "AAAA")

    def test_png(self):
        mt, data = asm3.microchip_extract._split_data_url("data:image/png;base64,xyz123==")
        self.assertEqual(mt, "image/png")
        self.assertEqual(data, "xyz123==")

    def test_invalid_raises(self):
        with self.assertRaises(ValueError):
            asm3.microchip_extract._split_data_url("not a data url")


class TestParseJsonResponse(unittest.TestCase):

    def test_plain_json(self):
        r = asm3.microchip_extract._parse_json_response('{"rows":[{"name":"a"}]}')
        self.assertEqual(r, {"rows": [{"name": "a"}]})

    def test_fenced_json(self):
        s = "```json\n{\"rows\":[{\"name\":\"a\"}]}\n```"
        r = asm3.microchip_extract._parse_json_response(s)
        self.assertEqual(r, {"rows": [{"name": "a"}]})

    def test_malformed_returns_empty(self):
        r = asm3.microchip_extract._parse_json_response("this is not json at all")
        self.assertEqual(r, {"rows": []})

    def test_embedded_json(self):
        s = "Here is the data:\n{\"rows\":[{\"name\":\"a\"}]}\nHope this helps."
        r = asm3.microchip_extract._parse_json_response(s)
        self.assertEqual(r, {"rows": [{"name": "a"}]})

    def test_rows_not_list(self):
        r = asm3.microchip_extract._parse_json_response('{"rows":"oops"}')
        self.assertEqual(r, {"rows": []})

    def test_empty_text(self):
        r = asm3.microchip_extract._parse_json_response("")
        self.assertEqual(r, {"rows": []})


class TestExtractRows(unittest.TestCase):

    def test_normalises_fields(self):
        provider = FakeProvider('{"rows":[{"microchip":" 900255003188952 ","name":" Janet ","implant_date":"2025-08-01","sex":"f"}]}')
        rows = asm3.microchip_extract.extract_rows(
            ["data:image/jpeg;base64,xxxx"], provider=provider)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["microchip"], "900255003188952")
        self.assertEqual(rows[0]["name"], "Janet")
        self.assertEqual(rows[0]["sex"], "F")
        self.assertEqual(rows[0]["implant_date"], "2025-08-01")

    def test_empty_input(self):
        rows = asm3.microchip_extract.extract_rows([], provider=FakeProvider("{}"))
        self.assertEqual(rows, [])

    def test_malformed_response_returns_empty(self):
        provider = FakeProvider("sorry I can't read this image")
        rows = asm3.microchip_extract.extract_rows(
            ["data:image/jpeg;base64,xxxx"], provider=provider)
        self.assertEqual(rows, [])

    def test_passes_images_to_provider(self):
        provider = FakeProvider('{"rows":[]}')
        asm3.microchip_extract.extract_rows(
            ["data:image/jpeg;base64,abc", "data:image/png;base64,def"],
            provider=provider)
        self.assertEqual(len(provider.last_images), 2)
        self.assertEqual(provider.last_images[0]["media_type"], "image/jpeg")
        self.assertEqual(provider.last_images[1]["media_type"], "image/png")


class Row(dict):
    """dict with attribute access, mirroring asm3.utils.ResultRow case-insensitive access."""
    def __getattr__(self, k):
        if k in self:
            return self[k]
        u = k.upper()
        if u in self:
            return self[u]
        raise AttributeError(k)


class FakeDBO:
    """Minimal DBO: routes by which column is in the WHERE clause."""
    def __init__(self, animal_rows=None, chip_rows=None):
        self.animal_rows = animal_rows or []
        self.chip_rows = chip_rows or []

    def query(self, sql, params=None):
        if "WHERE IdentichipNumber" in sql:
            return self.chip_rows
        return self.animal_rows


class TestMatchRows(unittest.TestCase):

    def test_exact_match_one_candidate(self):
        dbo = FakeDBO(animal_rows=[
            Row(ID=42, SHELTERCODE="H2501", ANIMALNAME="Janet", ARCHIVED=0, IDENTICHIPNUMBER="", DATEOFBIRTH=None)
        ])
        rows = [{"name": "janet", "microchip": "900255003188952",
                 "implant_date": "2025-08-01", "sex": "F"}]
        matched = asm3.microchip_extract.match_rows(dbo, rows)
        self.assertEqual(matched[0]["matched_animal_id"], 42)
        self.assertEqual(matched[0]["warnings"], [])

    def test_multiple_candidates_no_auto_match(self):
        dbo = FakeDBO(animal_rows=[
            Row(ID=1, SHELTERCODE="A1", ANIMALNAME="Janet", ARCHIVED=0, IDENTICHIPNUMBER="", DATEOFBIRTH=None),
            Row(ID=2, SHELTERCODE="A2", ANIMALNAME="Janet", ARCHIVED=1, IDENTICHIPNUMBER="", DATEOFBIRTH=None)
        ])
        rows = [{"name": "Janet", "microchip": "900255003188952",
                 "implant_date": "", "sex": ""}]
        matched = asm3.microchip_extract.match_rows(dbo, rows)
        self.assertIsNone(matched[0]["matched_animal_id"])
        self.assertIn("2 animals share this name", " | ".join(matched[0]["warnings"]))

    def test_unknown_name_warns(self):
        dbo = FakeDBO(animal_rows=[])
        rows = [{"name": "ZZZNoSuch", "microchip": "900255003188999",
                 "implant_date": "", "sex": ""}]
        matched = asm3.microchip_extract.match_rows(dbo, rows)
        self.assertIsNone(matched[0]["matched_animal_id"])
        self.assertIn("No animal matches this name",
            " | ".join(matched[0]["warnings"]))

    def test_blank_name_warns(self):
        dbo = FakeDBO()
        rows = [{"name": "", "microchip": "900255003188999",
                 "implant_date": "", "sex": ""}]
        matched = asm3.microchip_extract.match_rows(dbo, rows)
        self.assertIn("No name extracted", " | ".join(matched[0]["warnings"]))

    def test_blank_chip_warns(self):
        dbo = FakeDBO()
        rows = [{"name": "Nobody", "microchip": "", "implant_date": "", "sex": ""}]
        matched = asm3.microchip_extract.match_rows(dbo, rows)
        self.assertIn("No microchip number extracted",
            " | ".join(matched[0]["warnings"]))

    def test_short_chip_warns(self):
        dbo = FakeDBO()
        rows = [{"name": "Nobody", "microchip": "123", "implant_date": "", "sex": ""}]
        matched = asm3.microchip_extract.match_rows(dbo, rows)
        self.assertIn("Chip number is not 15 digits",
            " | ".join(matched[0]["warnings"]))

    def test_chip_already_in_use_flagged(self):
        dbo = FakeDBO(
            animal_rows=[Row(ID=42, SHELTERCODE="H2501", ANIMALNAME="Janet", ARCHIVED=0, IDENTICHIPNUMBER="", DATEOFBIRTH=None)],
            chip_rows=[Row(ID=99, SHELTERCODE="H9900", ANIMALNAME="OtherAnimal")]
        )
        rows = [{"name": "Janet", "microchip": "900255003188952",
                 "implant_date": "", "sex": ""}]
        matched = asm3.microchip_extract.match_rows(dbo, rows)
        self.assertEqual(len(matched[0]["chip_in_use_by"]), 1)
        self.assertEqual(matched[0]["chip_in_use_by"][0]["id"], 99)

    def test_candidate_includes_existing_dob(self):
        import datetime
        dbo = FakeDBO(animal_rows=[
            Row(ID=42, SHELTERCODE="H2501", ANIMALNAME="Janet", ARCHIVED=0,
                IDENTICHIPNUMBER="", DATEOFBIRTH=datetime.datetime(2024, 6, 21))
        ])
        rows = [{"name": "Janet", "microchip": "900255003188952",
                 "implant_date": "", "date_of_birth": "", "sex": ""}]
        matched = asm3.microchip_extract.match_rows(dbo, rows)
        self.assertEqual(matched[0]["candidates"][0]["existing_dob"], "2024-06-21")

    def test_candidate_includes_existing_chip(self):
        dbo = FakeDBO(animal_rows=[
            Row(ID=42, SHELTERCODE="H2501", ANIMALNAME="Janet",
                ARCHIVED=0, IDENTICHIPNUMBER="900255003188000", DATEOFBIRTH=None)
        ])
        rows = [{"name": "Janet", "microchip": "900255003188952",
                 "implant_date": "", "sex": ""}]
        matched = asm3.microchip_extract.match_rows(dbo, rows)
        self.assertEqual(matched[0]["candidates"][0]["existing_chip"], "900255003188000")


class TestPermissionConstant(unittest.TestCase):

    def test_bumc_defined(self):
        self.assertEqual(asm3.users.BULK_UPDATE_MICROCHIP, "bumc")


if __name__ == "__main__":
    unittest.main()
