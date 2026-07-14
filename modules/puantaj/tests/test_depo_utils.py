from __future__ import annotations

import unittest

from app.services.depo_utils import candidate_seri_keys, normalize_stok_kodu, parse_barkod, utc_now


class BarkodParserTest(unittest.TestCase):
    def test_candidate_keys(self):
        cases = {
            "RW313131": ["RW313131"],
            "1132xRW313131": ["1132XRW313131", "RW313131"],
            "1132XRW313131": ["1132XRW313131", "RW313131"],
            "1132×RW313131": ["1132×RW313131", "RW313131"],
            "1132/RW313131": ["1132/RW313131", "RW313131"],
            "1132-RW313131": ["1132-RW313131", "RW313131"],
            "1132*RW313131": ["1132*RW313131", "RW313131"],
            "1132 x RW313131": ["1132XRW313131", "RW313131"],
            "RW31X3131": ["RW31X3131"],
            "ABX12345": ["ABX12345"],
            "RX113X55": ["RX113X55"],
            "XRW313131": ["XRW313131"],
            "": [],
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(candidate_seri_keys(raw), expected)

    def test_invisible_characters_are_removed(self):
        parsed = parse_barkod("﻿1132xRW31​3131\r\n")
        self.assertEqual(parsed.stock_code, "1132")
        self.assertEqual(parsed.serial, "RW313131")
        self.assertEqual(parsed.normalized, "1132XRW313131")


class NormalizeStokKoduTest(unittest.TestCase):
    def test_kucuk_harf_buyutulur(self):
        self.assertEqual(normalize_stok_kodu("ab12"), "AB12")
        self.assertEqual(normalize_stok_kodu("  ab12  "), "AB12")

    def test_ayni_kod_farkli_harf_ile_esitlenir(self):
        self.assertEqual(normalize_stok_kodu("ab12"), normalize_stok_kodu("AB12"))

    def test_sayisal_girdiler(self):
        self.assertEqual(normalize_stok_kodu(1132), "1132")
        self.assertEqual(normalize_stok_kodu(1132.0), "1132")
        self.assertEqual(normalize_stok_kodu(None), "")


class UtcNowTest(unittest.TestCase):
    def test_naive_utc_dondurur(self):
        self.assertIsNone(utc_now().tzinfo)


if __name__ == "__main__":
    unittest.main()
