
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


if __name__ == "__main__":
    unittest.main()
