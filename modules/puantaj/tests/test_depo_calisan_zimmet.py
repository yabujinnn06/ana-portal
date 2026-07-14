from __future__ import annotations

import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.models import (
    Base,
    Department,
    DepoAuditLog,
    DepoDepo,
    DepoSayimStok,
    DepoSeri,
    DepoUser,
    DepoZimmetHareketi,
    Employee,
    SayimOturumu,
)
from app.routers.depo.zimmet import (
    BarkodKontrolIn,
    ZimmetAtaIn,
    ZimmetIadeIn,
    ata,
    barkod_kontrol,
    calisan_detay,
    calisanlar,
    iade,
)


def _request() -> Request:
    return Request({"type": "http", "method": "POST", "path": "/", "headers": [], "client": ("127.0.0.1", 1)})


class DepoCalisanZimmetTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(
            self.engine,
            tables=[
                Department.__table__,
                Employee.__table__,
                DepoUser.__table__,
                DepoDepo.__table__,
                SayimOturumu.__table__,
                DepoSayimStok.__table__,
                DepoSeri.__table__,
                DepoZimmetHareketi.__table__,
                DepoAuditLog.__table__,
            ],
        )
        self.db = Session(self.engine, expire_on_commit=False)
        department = Department(name="Teknik")
        self.ayse = Employee(full_name="Ayse Yilmaz", department=department)
        self.mehmet = Employee(full_name="Mehmet Kaya", department=department)
        self.user = DepoUser(ad="depocu", pin_hash="x", rol="sayan", aktif=True)
        depo = DepoDepo(ad="Merkez")
        oturum = SayimOturumu(ad="Ana Sayim", durum="aktif", depo=depo)
        stok = DepoSayimStok(oturum=oturum, stok_kodu="1001", urun_adi="El Terminali")
        self.db.add_all([self.ayse, self.mehmet, self.user, depo, oturum, stok])
        self.db.flush()
        self.seri = DepoSeri(
            oturum_id=oturum.id,
            stok=stok,
            depo_id=None,
            seri_no="RW-001",
            seri_no_norm="RW-001",
            sayildi=True,
        )
        self.db.add(self.seri)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_calisan_ara_ve_barkod_kontrol(self):
        rows = calisanlar(q="ayse", db=self.db, _=self.user)
        self.assertEqual([row["id"] for row in rows], [self.ayse.id])
        result = barkod_kontrol(BarkodKontrolIn(barkod="rw-001"), db=self.db, _=self.user)
        self.assertEqual(len(result["sonuclar"]), 1)
        self.assertEqual(result["sonuclar"][0]["urun_adi"], "El Terminali")

    def test_zimmet_devir_onayi_ve_iade_gecmisi(self):
        first = ata(
            ZimmetAtaIn(employee_id=self.ayse.id, seri_ids=[self.seri.id]),
            request=_request(), db=self.db, user=self.user,
        )
        self.assertEqual(first["atanan"], 1)
        self.assertEqual(self.seri.zimmet_employee_id, self.ayse.id)

        with self.assertRaises(HTTPException) as ctx:
            ata(
                ZimmetAtaIn(employee_id=self.mehmet.id, seri_ids=[self.seri.id]),
                request=_request(), db=self.db, user=self.user,
            )
        self.assertEqual(ctx.exception.status_code, 409)

        transfer = ata(
            ZimmetAtaIn(
                employee_id=self.mehmet.id,
                seri_ids=[self.seri.id],
                devir_onaylandi=True,
            ),
            request=_request(), db=self.db, user=self.user,
        )
        self.assertEqual(transfer["devir"], 1)
        self.assertEqual(self.seri.zimmet_employee_id, self.mehmet.id)

        returned = iade(
            ZimmetIadeIn(seri_ids=[self.seri.id], notu="Saglam teslim"),
            request=_request(), db=self.db, user=self.user,
        )
        self.assertEqual(returned["iade"], 1)
        self.assertIsNone(self.seri.zimmet_employee_id)

        actions = [row.islem for row in self.db.query(DepoZimmetHareketi).order_by(DepoZimmetHareketi.id)]
        self.assertEqual(actions, ["zimmet", "devir", "iade"])
        detail = calisan_detay(self.mehmet.id, db=self.db, _=self.user)
        self.assertEqual(detail["zimmetler"], [])
        self.assertEqual([row["islem"] for row in detail["hareketler"]], ["iade", "devir"])


if __name__ == "__main__":
    unittest.main()
