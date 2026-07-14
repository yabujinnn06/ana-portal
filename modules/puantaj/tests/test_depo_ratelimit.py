from __future__ import annotations

import unittest
from unittest.mock import patch

from app.services import depo_ratelimit
from app.services.depo_ratelimit import hiz_limiti
from fastapi import HTTPException


class _SahteUser:
    def __init__(self, uid: int):
        self.id = uid


class DepoHizLimitiTest(unittest.TestCase):
    def setUp(self):
        depo_ratelimit._hiz_limit_gecmis.clear()

    def test_limit_asilinca_429(self):
        dep = hiz_limiti("test_islem", 3, 10)
        zaman = [0.0]
        with patch("app.services.depo_ratelimit.time.monotonic", side_effect=lambda: zaman[0]):
            for _ in range(3):
                dep(_SahteUser(1))
            with self.assertRaises(HTTPException) as ctx:
                dep(_SahteUser(1))
            self.assertEqual(ctx.exception.status_code, 429)

    def test_pencere_gecince_acilir(self):
        dep = hiz_limiti("test_islem2", 2, 10)
        zaman = [0.0]
        with patch("app.services.depo_ratelimit.time.monotonic", side_effect=lambda: zaman[0]):
            dep(_SahteUser(2))
            dep(_SahteUser(2))
            zaman[0] = 11.0
            dep(_SahteUser(2))  # eski istekler pencere disina cikti, hata olmamali

    def test_farkli_kullanicilar_birbirini_etkilemez(self):
        dep = hiz_limiti("test_islem3", 1, 10)
        zaman = [0.0]
        with patch("app.services.depo_ratelimit.time.monotonic", side_effect=lambda: zaman[0]):
            dep(_SahteUser(1))
            dep(_SahteUser(2))  # farkli kullanici, hata olmamali


if __name__ == "__main__":
    unittest.main()
