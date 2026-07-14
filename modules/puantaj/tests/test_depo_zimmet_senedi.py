from __future__ import annotations

import asyncio
import unittest
from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import Base, DepoDepo, DepoSayimStok, DepoSeri, DepoUser, Employee, SayimOturumu
from app.routers.depo.zimmet_senedi import ZimmetSenediPdfIn, zimmet_senedi_bugun, zimmet_senedi_pdf
from app.services.depo_utils import utc_now


async def _read_streaming_response(response) -> bytes:
    chunks = []
    async for chunk in response.body_iterator:
        chunks.append(chunk)
    return b"".join(chunks)


class DepoZimmetSenediTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(
            self.engine,
            tables=[
                DepoUser.__table__,
                SayimOturumu.__table__,
                DepoSayimStok.__table__,
                DepoSeri.__table__,
                DepoDepo.__table__,
                Employee.__table__,
            ],
        )
        self.db = Session(self.engine, expire_on_commit=False)
        self.aktor = DepoUser(ad="depocu", pin_hash="x", rol="sayan", aktif=True)
        self.oturum = SayimOturumu(ad="Test", durum="aktif")
        self.db.add_all([self.aktor, self.oturum])
        self.db.flush()

        self.depo = DepoDepo(ad="Merkez Depo")
        self.db.add(self.depo)
        self.db.flush()

        self.employee = Employee(full_name="Ayse Yilmaz")
        self.db.add(self.employee)
        self.db.flush()

        self.bagli_kullanici = DepoUser(
            ad="ayse.y", pin_hash="x", rol="sayan", aktif=True, employee_id=self.employee.id
        )
        self.bagsiz_kullanici = DepoUser(ad="mehmet", pin_hash="x", rol="sayan", aktif=True)
        self.db.add_all([self.bagli_kullanici, self.bagsiz_kullanici])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _stok_seri(self, kod: str, seri_no: str, *, zimmet_kullanici_id=None, zimmet_zaman=None, depo_id=None):
        stok = (
            self.db.query(DepoSayimStok)
            .filter_by(oturum_id=self.oturum.id, stok_kodu=kod)
            .one_or_none()
        )
        if stok is None:
            stok = DepoSayimStok(oturum_id=self.oturum.id, stok_kodu=kod, urun_adi=f"Urun {kod}", portal_sayim=0)
            self.db.add(stok)
            self.db.flush()
        seri = DepoSeri(
            oturum_id=self.oturum.id,
            stok_id=stok.id,
            depo_id=depo_id,
            seri_no=seri_no,
            seri_no_norm=seri_no.upper(),
            sayildi=True,
            zimmet_kullanici_id=zimmet_kullanici_id,
            zimmet_zaman=zimmet_zaman,
        )
        self.db.add(seri)
        self.db.commit()
        return stok, seri

    def test_bugun_gruplama_ve_ad_cozumleme(self):
        simdi = utc_now()
        self._stok_seri(
            "1132", "RW0001", zimmet_kullanici_id=self.bagli_kullanici.id, zimmet_zaman=simdi, depo_id=self.depo.id
        )
        self._stok_seri(
            "1132", "RW0002", zimmet_kullanici_id=self.bagli_kullanici.id, zimmet_zaman=simdi, depo_id=self.depo.id
        )
        self._stok_seri(
            "2241", "RW0003", zimmet_kullanici_id=self.bagsiz_kullanici.id, zimmet_zaman=simdi, depo_id=self.depo.id
        )
        # 2 gun once zimmetlenmis; bugunun raporuna dahil olmamali.
        self._stok_seri(
            "2241", "RW0004",
            zimmet_kullanici_id=self.bagsiz_kullanici.id,
            zimmet_zaman=simdi - timedelta(days=2),
            depo_id=self.depo.id,
        )

        result = zimmet_senedi_bugun(tarih=None, db=self.db, _=self.aktor)
        calisanlar = {c["depo_user_id"]: c for c in result["calisanlar"]}

        self.assertEqual(len(calisanlar), 2)
        self.assertEqual(calisanlar[self.bagli_kullanici.id]["ad"], "Ayse Yilmaz")
        self.assertEqual(calisanlar[self.bagli_kullanici.id]["employee_id"], self.employee.id)
        self.assertEqual(calisanlar[self.bagli_kullanici.id]["urun_sayisi"], 2)
        self.assertEqual(calisanlar[self.bagsiz_kullanici.id]["ad"], "mehmet")
        self.assertIsNone(calisanlar[self.bagsiz_kullanici.id]["employee_id"])
        self.assertEqual(calisanlar[self.bagsiz_kullanici.id]["urun_sayisi"], 1)

    def test_pdf_gecerli_secim_icin_pdf_dondurur(self):
        simdi = utc_now()
        self._stok_seri(
            "1132", "RW0001", zimmet_kullanici_id=self.bagli_kullanici.id, zimmet_zaman=simdi, depo_id=self.depo.id
        )
        self._stok_seri(
            "2241", "RW0002", zimmet_kullanici_id=self.bagsiz_kullanici.id, zimmet_zaman=simdi, depo_id=self.depo.id
        )

        response = zimmet_senedi_pdf(
            ZimmetSenediPdfIn(depo_user_ids=[self.bagli_kullanici.id, self.bagsiz_kullanici.id]),
            db=self.db,
            _=self.aktor,
        )
        self.assertEqual(response.headers["content-type"], "application/pdf")
        content = asyncio.run(_read_streaming_response(response))
        self.assertGreater(len(content), 500)
        self.assertTrue(content.startswith(b"%PDF"))

    def test_pdf_hicbir_zimmet_yoksa_404(self):
        with self.assertRaises(ApiError) as ctx:
            zimmet_senedi_pdf(
                ZimmetSenediPdfIn(depo_user_ids=[self.bagli_kullanici.id]),
                db=self.db,
                _=self.aktor,
            )
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    def test_pdf_bos_kullaniciyi_atlar_digerini_dondurur(self):
        simdi = utc_now()
        self._stok_seri(
            "1132", "RW0001", zimmet_kullanici_id=self.bagli_kullanici.id, zimmet_zaman=simdi, depo_id=self.depo.id
        )
        # bagsiz_kullanici bugun icin hic zimmet almadi -> secilse de atlanmali.

        response = zimmet_senedi_pdf(
            ZimmetSenediPdfIn(depo_user_ids=[self.bagli_kullanici.id, self.bagsiz_kullanici.id]),
            db=self.db,
            _=self.aktor,
        )
        self.assertEqual(response.headers["content-type"], "application/pdf")
        content = asyncio.run(_read_streaming_response(response))
        self.assertTrue(content.startswith(b"%PDF"))
        self.assertGreater(len(content), 500)


if __name__ == "__main__":
    unittest.main()
