from __future__ import annotations

import asyncio
import unittest
from io import BytesIO

from fastapi import UploadFile
from openpyxl import Workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base, DepoSayimStok, DepoSeri, DepoTaramaLog, DepoUser, SayimOturumu
from app.routers.depo.import_excel import stok_excel


class DepoImportExcelTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(
            self.engine,
            tables=[
                DepoUser.__table__,
                SayimOturumu.__table__,
                DepoSayimStok.__table__,
                DepoSeri.__table__,
                DepoTaramaLog.__table__,
            ],
        )
        self.db = Session(self.engine, expire_on_commit=False)
        self.user = DepoUser(ad="admin", pin_hash="x", rol="admin", aktif=True)
        self.oturum = SayimOturumu(ad="Test", durum="aktif")
        self.db.add_all([self.user, self.oturum])
        self.db.flush()
        self.stok = DepoSayimStok(
            oturum_id=self.oturum.id,
            stok_kodu="1132",
            urun_adi="Eski",
            portal_sayim=5,
        )
        self.db.add(self.stok)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_zero_portal_updates_and_cross_stock_conflict_is_reported(self):
        wb = Workbook()
        ws = wb.active
        ws.title = "Veri"
        ws.append(["Stok", "Urun", "Seri", "Portal"])
        ws.append(["1132", "Urun 1132", "RW313131", 0, None, None, None, None, None, None, "Ali"])
        ws.append(["2241", "Urun 2241", "RW313131", 2])
        data = BytesIO()
        wb.save(data)
        data.seek(0)

        result = asyncio.run(stok_excel(
            self.oturum.id,
            UploadFile(file=data, filename="test.xlsx"),
            devam=True,
            db=self.db,
            _=self.user,
        ))

        self.db.refresh(self.stok)
        self.assertEqual(self.stok.portal_sayim, 0)
        self.assertEqual(result["cakismali_seri"], 1)
        self.assertEqual(result["hatali_satir"], 0)
        self.assertEqual(result["supheli_onceki_sayim"], 1)

    def test_alfasayisal_stok_kodu_buyuk_kucuk_harf_esitlenir(self):
        alfa_stok = DepoSayimStok(
            oturum_id=self.oturum.id,
            stok_kodu="AB12",
            urun_adi="Alfa Urun",
            portal_sayim=3,
        )
        self.db.add(alfa_stok)
        self.db.commit()

        wb = Workbook()
        ws = wb.active
        ws.title = "Veri"
        ws.append(["Stok", "Urun", "Seri", "Portal"])
        ws.append(["ab12", "Alfa Urun", "SN001", 3])
        data = BytesIO()
        wb.save(data)
        data.seek(0)

        result = asyncio.run(stok_excel(
            self.oturum.id,
            UploadFile(file=data, filename="test2.xlsx"),
            devam=False,
            db=self.db,
            _=self.user,
        ))

        self.assertEqual(result["eklenen_stok"], 0)
        stoklar = self.db.query(DepoSayimStok).filter(
            DepoSayimStok.oturum_id == self.oturum.id, DepoSayimStok.stok_kodu == "AB12"
        ).all()
        self.assertEqual(len(stoklar), 1)
        self.assertEqual(stoklar[0].id, alfa_stok.id)


if __name__ == "__main__":
    unittest.main()
