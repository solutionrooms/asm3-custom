
import sys
import unittest

from types import SimpleNamespace


class _DummyHTML:
    def xpath(self, *_args, **_kwargs):
        return []


_dummy_etree = SimpleNamespace(HTML=lambda *_args, **_kwargs: _DummyHTML())
sys.modules.setdefault("lxml", SimpleNamespace(etree=_dummy_etree))
sys.modules.setdefault("lxml.etree", _dummy_etree)

import base

import asm3.animal
import asm3.utils
import asm3.lookups
import asm3.log

import main


class TestHedgehogObservation(unittest.TestCase):

    def test_controller_without_context_returns_empty_animal(self):
        dbo = base.get_dbo()
        lf = asm3.animal.LocationFilter(None, 0, "")
        post = asm3.utils.PostedData({}, "en")
        params = SimpleNamespace(
            post=post,
            dbo=dbo,
            locale="en",
            user="unittest",
            lf=lf
        )

        endpoint = main.hedgehog_observation()

        original_get_log_types = asm3.lookups.get_log_types
        asm3.lookups.get_log_types = lambda _dbo: []
        try:
            result = endpoint.controller(params)
        finally:
            asm3.lookups.get_log_types = original_get_log_types

        self.assertIsNone(result["animal"])
        self.assertIsNone(result["recent"])
        self.assertEqual(result["latestmediaid"], 0)
        self.assertEqual(result["history7"], [])
        self.assertIsInstance(result["logtypes"], list)

    def test_history_controller_sets_expected_flags(self):
        dbo = base.get_dbo()
        lf = asm3.animal.LocationFilter(None, 0, "")
        post = asm3.utils.PostedData({}, "en")
        params = SimpleNamespace(
            post=post,
            dbo=dbo,
            locale="en",
            user="unittest",
            lf=lf
        )
        endpoint = main.hedgehog_observation_history()
        original_get_log_types = asm3.lookups.get_log_types
        asm3.lookups.get_log_types = lambda _dbo: []
        try:
            result = endpoint.controller(params)
        finally:
            asm3.lookups.get_log_types = original_get_log_types
        self.assertTrue(result["history_mode"])
        self.assertTrue(result["allow_custom_date"])
        self.assertEqual(result["history"], [])
        self.assertIsNone(result["today"])

    def test_post_save_respects_logdatetime(self):
        dbo = base.get_dbo()
        post = asm3.utils.PostedData({
            "logs": "123==All good",
            "logtype": "5",
            "logdatetime": "2024-01-15T10:30:00"
        }, "en")
        params = SimpleNamespace(
            post=post,
            dbo=dbo,
            locale="en",
            user="tester"
        )
        main.session.superuser = 1
        main.session.securitymap = ""
        main.session.locale = "en"
        main.session.user = "tester"
        main.session.dbo = dbo
        captured = {}

        original_add_log = asm3.log.add_log
        asm3.log.add_log = lambda dbo_, user_, linktype, linkid, logtypeid, logtext, logdatetime=None: captured.update({
            "dbo": dbo_,
            "user": user_,
            "linktype": linktype,
            "linkid": linkid,
            "logtypeid": logtypeid,
            "logtext": logtext,
            "logdatetime": logdatetime
        }) or 42
        try:
            result = main.hedgehog_observation().post_save(params)
        finally:
            asm3.log.add_log = original_add_log
        self.assertEqual(result, "1")
        self.assertIn("logdatetime", captured)
        self.assertIsNotNone(captured["logdatetime"])
        self.assertEqual(captured["logdatetime"].year, 2024)
        self.assertEqual(captured["logdatetime"].hour, 10)
        self.assertEqual(captured["linkid"], 123)


if __name__ == "__main__":
    unittest.main()
