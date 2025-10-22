
import unittest
import base

import asm3.animal
import asm3.animalname
import asm3.animalnamepool
import asm3.utils

class TestAnimalName(unittest.TestCase):

    def setUp(self):
        self.dbo = base.get_dbo()
        self.dbo.execute("CREATE TABLE IF NOT EXISTS animalname (ID INTEGER PRIMARY KEY, Name VARCHAR(1024), Sex INTEGER)")
        self.dbo.execute("DELETE FROM animalname")

    def test_get_random_name(self):
        self.assertNotEqual("", asm3.animalname.get_random_name())

    def test_pick_random_name_from_pool(self):
        asm3.animalnamepool.insert(self.dbo, "tester", "Arya Stark", asm3.animalnamepool.SEX_FEMALE)
        asm3.animalnamepool.insert(self.dbo, "tester", "Sansa Stark", asm3.animalnamepool.SEX_FEMALE)
        name = asm3.animalnamepool.pick_random_name(self.dbo, asm3.animalnamepool.SEX_FEMALE)
        self.assertIn(name, ["Arya Stark", "Sansa Stark"])
        with self.assertRaises(asm3.utils.ASMValidationError):
            asm3.animalnamepool.insert(self.dbo, "tester", "Arya Stark", asm3.animalnamepool.SEX_FEMALE)

    def test_get_random_name_prefers_pool(self):
        asm3.animalnamepool.insert(self.dbo, "tester", "Jon Snow", asm3.animalnamepool.SEX_MALE)
        name = asm3.animal.get_random_name(self.dbo, asm3.animalnamepool.SEX_MALE)
        self.assertEqual("Jon Snow", name)
